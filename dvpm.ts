// =============================================================================
// File        : dvpm.ts
// Author      : yukimemi
// Last Change : 2023/11/03 20:35:48.
// =============================================================================

import * as buffer from "https://deno.land/x/denops_std@v5.0.1/buffer/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.0.1/function/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.1/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { assert, is } from "https://deno.land/x/unknownutil@v3.10.0/mod.ts";
import { cache, notify } from "./util.ts";
import { echo, execute } from "https://deno.land/x/denops_std@v5.0.1/helper/mod.ts";
import { sprintf } from "https://deno.land/std@0.204.0/fmt/printf.ts";
import { type Plug, Plugin, PluginOption } from "./plugin.ts";

const concurrency = 8;
const listSpace = 3;

export type DvpmOption = {
  base: string;
  cache?: string;
  debug?: boolean;
  concurrency?: number;
  profile?: boolean;
  notify?: boolean;
  logarg?: string[];
};

export class Dvpm {
  #semaphore = new Semaphore(concurrency);

  #plugins: Plugin[] = [];
  #totalElaps: number;
  #installLogs: string[] = [];
  #updateLogs: string[] = [];
  #cacheScript: string[] = [];

  public isInstallOrUpdate = false;

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
      ...denops.dispatcher,

      async update(url: unknown): Promise<void> {
        if (url) {
          assert(url, is.String);
          await dvpm.update(url);
        } else {
          await dvpm.update();
        }
      },

      async bufWriteList(): Promise<void> {
        await dvpm.bufWriteList();
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
        command! -nargs=? DvpmList call s:${denops.name}_notify('bufWriteList', [<f-args>])
      `,
    );

    return dvpm;
  }

  // deno-lint-ignore no-explicit-any
  private clog(data: any) {
    if (this.dvpmOption.debug) {
      console.log(data);
    }
  }

  private findPlug(plugins: Plugin[], url: string): Plugin {
    const p = plugins.find((p) => p.plug.url === url);
    if (p == undefined) {
      throw `${url} plugin is not found !`;
    }
    return p;
  }

  private maxUrlLen(plugins: Plugin[]): number {
    return plugins.reduce((prev, cur) => prev.plug.url.length < cur.plug.url.length ? cur : prev)
      .plug.url.length;
  }

  private uniquePlug(plugins: Plugin[]): Plugin[] {
    return Array.from(new Set(plugins.map((a) => a.plug.url))).map((url) =>
      this.findPlug(plugins, url)
    );
  }

  private uniqueUrlByIsLoad(plugins: Plugin[]): Plugin[] {
    return plugins.filter((value, index, self) => {
      const found = self.find((v) => v.plug.url === value.plug.url && v.info.isLoad);
      if (found) {
        return found === value;
      }
      return self.findIndex((v) => v.plug.url === value.plug.url) === index;
    }).sort((a, b) => {
      if (a.info.isLoad && !b.info.isLoad) return -1;
      if (!a.info.isLoad && b.info.isLoad) return 1;
      return a.plug.url.localeCompare(b.plug.url);
    });
  }

  private async bufWrite(bufname: string, data: string[], opts?: {filetype?: string}) {
    const buf = await buffer.open(this.denops, bufname);
    await fn.setbufvar(this.denops, buf.bufnr, "&buftype", "nofile");
    await fn.setbufvar(this.denops, buf.bufnr, "&swapfile", 0);
    if (opts?.filetype) {
      await fn.setbufvar(this.denops, buf.bufnr, "&filetype", opts.filetype);
    }
    await buffer.replace(this.denops, buf.bufnr, data);
    await buffer.concrete(this.denops, buf.bufnr);
  }

  private async _install(p: Plugin) {
    await this.#semaphore.lock(async () => {
      const result = await p.install();
      if (result.isSuccess) {
        this.isInstallOrUpdate = true;
      }
      const output = result.value ?? result.error ?? [];
      if (output.length > 0) {
        this.#installLogs.push(...output);
        if (this.dvpmOption.notify) {
          await notify(this.denops, output.join("\r"));
        }
      }
    });
  }
  private async _update(p: Plugin) {
    await this.#semaphore.lock(async () => {
      const result = await p.update();
      if (result.isSuccess && result.value.length > 0) {
        this.isInstallOrUpdate = true;
      }
      const output = result.value ?? result.error ?? [];
      if (output.length > 0) {
        this.#updateLogs.push(...output);
        if (this.dvpmOption.notify) {
          await notify(this.denops, output.join("\r"));
        }
      }
    });
  }

  public async install(url?: string) {
    if (url) {
      const p = this.findPlug(this.#plugins, url);
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

    if (this.#installLogs.length > 0) {
      await this.bufWrite("dvpm://install", this.#installLogs);
    }
  }

  public async update(url?: string) {
    if (this.dvpmOption.notify) {
      await notify(this.denops, `Update start`);
    } else {
      await echo(this.denops, `Update start`);
    }
    if (url) {
      const p = this.findPlug(this.#plugins, url);
      await this._update(p);
    } else {
      await Promise.all(
        this.uniquePlug(this.#plugins).map(async (p) => {
          try {
            return await this._update(p);
          } catch (e) {
            console.error(e);
          }
        }),
      );
    }

    if (this.#updateLogs.length > 0) {
      await this.bufWrite("dvpm://update", this.#updateLogs, {filetype: "diff"});
    }
    if (this.dvpmOption.notify) {
      await notify(this.denops, `Update done`);
    } else {
      await echo(this.denops, `Update done`);
    }
  }

  public list(): Plugin[] {
    return this.uniqueUrlByIsLoad(this.#plugins);
  }

  public async bufWriteList() {
    const maxLen = this.maxUrlLen(this.#plugins);
    const uniquePlug = this.uniqueUrlByIsLoad(this.#plugins);
    await this.bufWrite("dvpm://list", [
      sprintf(
        `%-${maxLen + listSpace}s : %-7s : %-7s : %s`,
        `url`,
        `isLoad`,
        `isCache`,
        `isClone`,
      ),
      `${"-".repeat(maxLen + listSpace)} : ------- : ------- : -------`,
      ...uniquePlug.map((p) =>
        sprintf(
          `%-${maxLen + listSpace}s : %-7s : %-7s : %s`,
          p.plug.url,
          `${p.info.isLoad}`,
          `${p.info.isCache}`,
          `${p.info.clone}`,
        )
      ),
      `${"-".repeat(maxLen + listSpace)} : ------- : ------- : -------`,
      sprintf(
        `%-${maxLen + listSpace}s : %s`,
        `Loaded count`,
        `${uniquePlug.filter((p) => p.info.isLoad).length}`,
      ),
      sprintf(
        `%-${maxLen + listSpace}s : %s`,
        `Not loaded count`,
        `${uniquePlug.filter((p) => !p.info.isLoad).length}`,
      ),
      `${"-".repeat(maxLen + listSpace)} : -------`,
      sprintf(
        `%-${maxLen + listSpace}s : %s`,
        `Total plugin count`,
        `${uniquePlug.length}`,
      ),
    ]);
  }

  public async uninstall(_url: string) {
    // TODO: Not implemented
  }

  public async add(plug: Plug) {
    try {
      if (plug.dependencies != undefined) {
        for (const dep of plug.dependencies) {
          if (dep.enabled == undefined) {
            dep.enabled = plug.enabled;
          }
          if (dep.clone == undefined) {
            dep.clone = plug.clone;
          }
          if (dep.cache == undefined) {
            dep.cache = plug.cache;
          }
          await this.add(dep);
        }
      }
      const pluginOption: PluginOption = {
        base: this.dvpmOption.base,
        debug: this.dvpmOption.debug,
        profile: this.dvpmOption.profile,
        logarg: this.dvpmOption.logarg,
      };
      const p = await Plugin.create(
        this.denops,
        plug,
        pluginOption,
      );
      await this._install(p);

      await this.#semaphore.lock(async () => {
        const c = await p.cache();
        if (c !== "") {
          this.#cacheScript.push(c);
        }
        await p.add();
        this.#plugins.push(p);
      });
    } catch (e) {
      console.error(e);
    }
  }

  public async end() {
    await Promise.all(
      this.uniquePlug(this.#plugins.filter((p) => p.info.isLoad)).map(
        async (p) => {
          try {
            return await this.#semaphore.lock(async () => {
              await p.end();
            });
          } catch (e) {
            console.error(e);
          }
        },
      ),
    );
    if (this.#installLogs.length > 0) {
      await this.bufWrite("dvpm://install", this.#installLogs);
    }
    if (this.dvpmOption.profile) {
      const maxLen = this.maxUrlLen(this.#plugins);
      const sortedPlugins = this.#plugins.filter((p) => p.info.isLoad)
        .sort((a, b) => b.info.elaps - a.info.elaps).map((p) =>
          sprintf(
            `%-${maxLen + listSpace}s : %s`,
            p.plug.url,
            `${Math.round(p.info.elaps * 1000) / 1000}`,
          )
        );
      this.#totalElaps = performance.now() - this.#totalElaps;
      await this.bufWrite("dvpm://profile", [
        sprintf(`%-${maxLen + listSpace}s : %s`, `url`, `elaps`),
        `${"-".repeat(maxLen + listSpace)} : ------`,
        ...sortedPlugins,
        `${"-".repeat(maxLen + listSpace)} : ------`,
        sprintf(
          `%-${maxLen + listSpace}s : %s`,
          `Total`,
          `${Math.round(this.#totalElaps * 1000) / 1000}`,
        ),
      ]);
    }
    if (await fn.exists(this.denops, "denops_server_addr")) {
      await execute(
        this.denops,
        `
          augroup denops_plugin_internal_startup
            autocmd!
          augroup END
        `,
      );
    }
    await this.denops.cmd(`doautocmd VimEnter`);
    if (this.dvpmOption.cache) {
      this.clog(`Cache: ${this.dvpmOption.cache}`);
      this.#cacheScript.unshift(`" This file is generated by dvpm.\n`);
      await cache(this.denops, {
        script: this.#cacheScript.map((s) => s.split(/\r?\n/).map((l) => l.trim()).join("\n")).join(
          "\n",
        ),
        path: this.dvpmOption.cache,
      });
    }
  }

  public async cache(arg: { script: string; path: string }) {
    await cache(this.denops, { script: arg.script, path: arg.path });
  }
}
