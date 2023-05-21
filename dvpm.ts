import { Denops } from "https://deno.land/x/denops_std@v4.3.3/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { execute } from "https://deno.land/x/denops_std@v4.3.3/helper/mod.ts";
import { type Plug, Plugin, PluginOption } from "./plugin.ts";
import { assertString } from "https://deno.land/x/unknownutil@v2.1.1/assert.ts";

export type DvpmOption = {
  base: string;
  debug?: boolean;
  concurrency?: number;
};

export class Dvpm {
  static lock = new Semaphore(1);

  #plugins: Plugin[];

  constructor(
    public denops: Denops,
    public dvpmOption: DvpmOption,
  ) {
    this.#plugins = [];

    if (this.dvpmOption.debug == undefined) {
      this.dvpmOption.debug = false;
    }
    if (this.dvpmOption.concurrency == undefined) {
      this.dvpmOption.concurrency = 8;
    } else {
      Plugin.semaphore = new Semaphore(this.dvpmOption.concurrency);
    }
  }

  public static async begin(
    denops: Denops,
    dvpmOption: DvpmOption,
  ): Promise<Dvpm> {
    const dvpm = new Dvpm(denops, dvpmOption);

    denops.dispatcher = {
      async update(url: unknown): Promise<void> {
        if (url) {
          assertString(url);
          await dvpm.update(url);
        } else {
          await dvpm.update();
        }
      },
    };

    await execute(
      denops,
      `
      function! s:${denops.name}_notify(method, params) abort
        call denops#plugin#wait_async('${denops.name}', function('denops#notify', ['${denops.name}', a:method, a:params]))
      endfunction
      function! s:${denops.name}_request(method, params) abort
        call denops#plugin#wait('${denops.name}')
        call denops#request('${denops.name}', a:method, a:params)
      endfunction
      command! -nargs=? DvpmUpdate call s:${denops.name}_notify('update', [<f-args>])
      `,
    );

    return dvpm;
  }

  private findPlug(url: string): Plugin {
    const p = this.#plugins.find((p) => p.plug.url === url);
    if (p == undefined) {
      throw `${url} plugin is not found !`;
    }
    return p;
  }

  public async install(url?: string) {
    if (url) {
      const p = this.findPlug(url);
      await p.install();
    } else {
      this.#plugins.forEach(async (p) => {
        try {
          await p.install();
        } catch (e) {
          console.error(e);
        }
      });
    }
  }

  public async update(url?: string) {
    if (url) {
      const p = this.findPlug(url);
      await p.update();
    } else {
      await Promise.all(this.#plugins.map(async (p) => {
        try {
          await p.update();
        } catch (e) {
          console.error(e);
        }
      }));
    }
  }

  public async uninstall(url: string) {
    // TODO: Not implemented
  }

  public async add(plug: Plug) {
    try {
      if (plug.dependencies != undefined) {
        for (const dep of plug.dependencies) {
          if (dep.enabled == undefined) {
            dep.enabled = plug.enabled;
          }
          await this.add(dep);
        }
      }
      const pluginOption: PluginOption = {
        base: this.dvpmOption.base,
        debug: this.dvpmOption.debug,
      };
      const p = await Plugin.create(
        this.denops,
        plug,
        pluginOption,
      );
      await p.install();
      await p.add();
      this.#plugins.push(p);
    } catch (e) {
      console.error(e);
    }
  }

  public async end() {
    await Promise.all(this.#plugins.map(async (p) => {
      try {
        await p.end();
      } catch (e) {
        console.error(e);
      }
    }));
    await this.denops.cmd(`silent! UpdateRemotePlugins`);
  }
}
