import * as buffer from "https://deno.land/x/denops_std@v5.0.0/buffer/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.0.0/function/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.0/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { assertString } from "https://deno.land/x/unknownutil@v2.1.1/assert.ts";
import { execute } from "https://deno.land/x/denops_std@v5.0.0/helper/mod.ts";
import { sprintf } from "https://deno.land/std@0.191.0/fmt/printf.ts";
import { type Plug, Plugin, PluginOption } from "./plugin.ts";

import { notify } from "./util.ts";

const concurrency = 8;

export type DvpmOption = {
  base: string;
  debug?: boolean;
  concurrency?: number;
  profile?: boolean;
  notify?: boolean;
};

type GitLog = {
  hash: string;
  date: string;
  message: string;
  body: string;
  authorName: string;
  autherEmail: string;
};

type GitLogs = {
  url: string;
  logs: GitLog[];
};

export class Dvpm {
  #semaphore = new Semaphore(concurrency);

  #plugins: Plugin[] = [];
  #totalElaps: number;
  #installLogs: string[] = [];
  #updateLogs: GitLogs[] = [];

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

  private uniquePlug(plugins: Plugin[]): Plugin[] {
    return Array.from(new Set(plugins.map((a) => a.plug.url))).map(
      (url) => this.findPlug(url),
    );
  }

  private async bufWrite(bufname: string, data: string[]) {
    const buf = await buffer.open(this.denops, bufname);
    await fn.setbufvar(this.denops, buf.bufnr, "&buftype", "nofile");
    await fn.setbufvar(this.denops, buf.bufnr, "&swapfile", 0);
    await buffer.replace(this.denops, buf.bufnr, data);
    await buffer.concrete(this.denops, buf.bufnr);
  }

  private async _install(p: Plugin) {
    await this.#semaphore.lock(async () => {
      const result = await p.install();
      if (result) {
        this.#installLogs.push(result);
        if (this.dvpmOption.notify) {
          await notify(this.denops, result);
        }
      }
    });
  }
  private async _update(p: Plugin) {
    await this.#semaphore.lock(async () => {
      try {
        const result = await p.update();
        if (result) {
          const updateLog: GitLogs = { url: p.plug.url, logs: [] };
          result.all.forEach((x) =>
            updateLog.logs.push({
              hash: x.hash,
              date: x.date,
              message: x.message,
              body: x.body,
              authorName: x.author_name,
              autherEmail: x.author_email,
            })
          );
          this.#updateLogs.push(updateLog);
          if (this.dvpmOption.notify) {
            const updateLogs = [
              `--- ${updateLog.url} --------------------`,
              ...updateLog.logs.flatMap((l) => [
                l.date,
                l.authorName,
                l.message,
              ]),
            ];
            await notify(this.denops, updateLogs.join("\r"));
          }
        }
      } catch (e) {
        throw e;
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

    if (this.#installLogs.length > 0) {
      await this.bufWrite("dvpm://install", this.#installLogs);
    }
  }

  public async update(url?: string) {
    if (this.dvpmOption.notify) {
      await notify(this.denops, `Update start`);
    } else {
      console.log(`Update start`);
    }
    if (url) {
      const p = this.findPlug(url);
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
      const updateLogs = this.#updateLogs.flatMap((u) => [
        `--- ${u.url} --------------------`,
        ...u.logs.flatMap((l) => [
          l.date,
          l.authorName,
          l.message,
        ]),
      ]);
      await this.bufWrite("dvpm://update", updateLogs);
    }
    if (this.dvpmOption.notify) {
      await notify(this.denops, `Update done`);
    } else {
      console.log(`Update done`);
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
      this.uniquePlug(this.#plugins.filter((p) => p.state.isLoad)).map(
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
