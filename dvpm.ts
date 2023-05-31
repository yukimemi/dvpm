import * as buffer from "https://deno.land/x/denops_std@v5.0.0/buffer/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.0.0/function/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.0/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { assertString } from "https://deno.land/x/unknownutil@v2.1.1/assert.ts";
import { execute } from "https://deno.land/x/denops_std@v5.0.0/helper/mod.ts";
import { sprintf } from "https://deno.land/std@0.189.0/fmt/printf.ts";
import { type Plug, Plugin, PluginOption } from "./plugin.ts";

const concurrency = 8;

export type DvpmOption = {
  base: string;
  debug?: boolean;
  concurrency?: number;
  profile?: boolean;
  notify?: boolean;
};

export class Dvpm {
  #logLock = new Semaphore(1);
  #semaphore = new Semaphore(concurrency);

  #plugins: Plugin[] = [];
  #totalElaps: number;
  #installLogs: string[] = [];
  #updateLogs: string[] = [];

  constructor(
    public denops: Denops,
    public dvpmOption: DvpmOption,
  ) {
    this.#totalElaps = performance.now();

    if (this.dvpmOption.concurrency == undefined) {
      this.dvpmOption.concurrency = concurrency;
    } else {
      this.#semaphore = new Semaphore(this.dvpmOption.concurrency);
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

  private async bufWrite(bufname: string, data: string[]) {
    const buf = await buffer.open(this.denops, bufname);
    await buffer.ensure(this.denops, buf.bufnr, async () => {
      await fn.setbufvar(this.denops, buf.bufnr, "&buftype", "nofile");
      await fn.setbufvar(this.denops, buf.bufnr, "&swapfile", 0);
      await buffer.replace(this.denops, buf.bufnr, data);
      await buffer.concrete(this.denops, buf.bufnr);
    });
  }

  private async writeLogs(
    plug: Plugin,
    target: string[],
    output: Deno.CommandOutput,
  ) {
    await this.#logLock.lock(() => {
      target.push(`---------- ${plug.plug.url} --------------------`);
      if (output.stdout) {
        new TextDecoder().decode(output.stdout).split("\n").forEach((s) =>
          target.push(s)
        );
      }
      if (output.stderr) {
        new TextDecoder().decode(output.stderr).split("\n").forEach((s) =>
          target.push(s)
        );
      }
      target.push(``);
    });
  }

  private async _install(p: Plugin) {
    await this.#semaphore.lock(async () => {
      const output = await p.install();
      if (output) {
        await this.writeLogs(p, this.#installLogs, output);
      }
    });
  }
  private async _update(p: Plugin) {
    await this.#semaphore.lock(async () => {
      const output = await p.update();
      if (output) {
        await this.writeLogs(p, this.#updateLogs, output);
      }
    });
  }

  public async install(url?: string) {
    if (url) {
      const p = this.findPlug(url);
      await this._install(p);
    } else {
      this.#plugins.forEach(async (p) => {
        try {
          await this._install(p);
        } catch (e) {
          console.error(e);
        }
      });
    }
  }

  public async update(url?: string) {
    if (url) {
      const p = this.findPlug(url);
      await this._update(p);
    } else {
      await Promise.all(this.#plugins.map((p) => {
        try {
          return this._update(p);
        } catch (e) {
          console.error(e);
        }
      }));
    }

    if (this.#updateLogs.length > 0) {
      await this.bufWrite("dvpm://update", this.#updateLogs);
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
        notify: this.dvpmOption.notify,
      };
      const p = await Plugin.create(
        this.denops,
        plug,
        pluginOption,
      );
      await this._install(p);

      await this.#semaphore.lock(async () => {
        await p.add();
        this.#plugins.push(p);
      });
    } catch (e) {
      console.error(e);
    }
  }

  public async end() {
    await Promise.all(
      this.#plugins.filter((p) => p.state.isLoad).map((p) => {
        try {
          return this.#semaphore.lock(async () => {
            await p.end();
          });
        } catch (e) {
          console.error(e);
        }
      }),
    );
    if (this.#installLogs.length > 0) {
      await this.bufWrite("dvpm://install", this.#installLogs);
    }
    if (this.dvpmOption.profile) {
      const sortedPlugins = this.#plugins.filter((p) => p.state.isLoad)
        .sort((a, b) => a.state.elaps - b.state.elaps).map((p) =>
          sprintf("%-50s: %s", p.plug.url, `${p.state.elaps}`)
        );
      this.#totalElaps = performance.now() - this.#totalElaps;
      await this.bufWrite("dvpm://profile", [
        `--- profile start ---`,
        ...sortedPlugins,
        `--- profile end ---`,
        `Total: ${this.#totalElaps}`,
      ]);
    }
    await this.denops.cmd(`silent! UpdateRemotePlugins`);
    await this.denops.cmd(`doautocmd VimEnter`);
  }
}
