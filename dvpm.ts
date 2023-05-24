import * as buffer from "https://deno.land/x/denops_std@v5.0.0/buffer/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.0.0/function/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.0/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { assertString } from "https://deno.land/x/unknownutil@v2.1.1/assert.ts";
import { execute } from "https://deno.land/x/denops_std@v5.0.0/helper/mod.ts";
import { sprintf } from "https://deno.land/std@0.188.0/fmt/printf.ts";
import { type Plug, Plugin, PluginOption } from "./plugin.ts";

export type DvpmOption = {
  base: string;
  debug?: boolean;
  concurrency?: number;
  profile?: boolean;
};

export class Dvpm {
  static lock = new Semaphore(1);

  #plugins: Plugin[];
  #totalElaps: number;

  constructor(
    public denops: Denops,
    public dvpmOption: DvpmOption,
  ) {
    this.#plugins = [];
    this.#totalElaps = performance.now();

    if (this.dvpmOption.debug == undefined) {
      this.dvpmOption.debug = false;
    }
    if (this.dvpmOption.concurrency == undefined) {
      this.dvpmOption.concurrency = 8;
    } else {
      Plugin.semaphore = new Semaphore(this.dvpmOption.concurrency);
    }
    if (this.dvpmOption.profile == undefined) {
      this.dvpmOption.profile = false;
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
        profile: this.dvpmOption.profile,
      };
      const p = await Plugin.create(
        this.denops,
        plug,
        pluginOption,
      );
      await p.install();
      if (await p.add()) {
        this.#plugins.push(p);
      }
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
    if (this.dvpmOption.profile) {
      const sortedPlugins = this.#plugins.filter((p) => p.state.isLoad)
        .sort((a, b) => a.state.elaps - b.state.elaps).map((p) =>
          sprintf("%-50s: %s", p.plug.url, `${p.state.elaps}`)
        );
      this.#totalElaps = performance.now() - this.#totalElaps;
      const buf = await buffer.open(this.denops, "dvpm://profile");
      await buffer.ensure(this.denops, buf.bufnr, async () => {
        await fn.setbufvar(this.denops, buf.bufnr, "&buftype", "nofile");
        await fn.setbufvar(this.denops, buf.bufnr, "&swapfile", 0);
        await buffer.replace(this.denops, buf.bufnr, [
          `--- profile start ---`,
          ...sortedPlugins,
          `--- profile end ---`,
          `Total: ${this.#totalElaps}`,
        ]);
        await buffer.concrete(this.denops, buf.bufnr);
      });
    }
    await this.denops.cmd(`silent! UpdateRemotePlugins`);
    await this.denops.cmd(`doautocmd VimEnter`);
  }
}
