// =============================================================================
// File        : dvpm.ts
// Author      : yukimemi
// Last Change : 2024/09/29 11:48:34.
// =============================================================================

import * as buffer from "jsr:@denops/std@7.2.0/buffer";
import * as fn from "jsr:@denops/std@7.2.0/function";
import type { Denops } from "jsr:@denops/std@7.2.0";
import { Semaphore } from "jsr:@lambdalisue/async@2.1.1";
import { cache, convertUrl, notify } from "./util.ts";
import { logger } from "./logger.ts";
import { echo, execute } from "jsr:@denops/std@7.2.0/helper";
import { z } from "npm:zod@3.23.8";
import { sprintf } from "jsr:@std/fmt@1.0.2/printf";
import { exists } from "jsr:@std/fs@1.0.4";
import { type DvpmOption, DvpmOptionSchema, type Plug } from "./types.ts";
import { Plugin } from "./plugin.ts";

const listSpace = 3;

export class Dvpm {

  #semaphore: Semaphore;
  #cacheScript: string[] = [];
  #installLogs: string[] = [];
  #updateLogs: string[] = [];
  #urls: string[] = [];

  /// Is install or update
  public isInstallOrUpdate = false;

  /// List of plugins
  public plugins: Plugin[] = [];

  /// Total elaps
  public totalElaps = 0;

  /**
   * Creates a new Dvpm instance
   */
  constructor(
    public denops: Denops,
    public option: DvpmOption,
  ) {
    this.totalElaps = performance.now();
    this.option = DvpmOptionSchema.parse(option);
    this.#semaphore = new Semaphore(this.option.concurrency);
  }

  /**
   * Creates a new Dvpm instance with the given options
   */
  public static async begin(
    denops: Denops,
    option: DvpmOption,
  ): Promise<Dvpm> {
    const dvpm = new Dvpm(denops, option);

    denops.dispatcher = {
      ...denops.dispatcher,

      async update(url: unknown): Promise<void> {
        if (url) {
          await dvpm.update(z.string().parse(url));
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

  private findPlugin(url: string): Plugin | undefined {
    const u = convertUrl(url);
    const p = this.plugins.find((p) => p.info.url === u);
    if (p == undefined) {
      console.error(`${url} plugin is not found !`);
    }
    return p;
  }

  private maxUrlLen(plugins: Plugin[]): number {
    return plugins.reduce((prev, cur) => prev.plug.url.length < cur.plug.url.length ? cur : prev)
      .plug.url.length;
  }

  private uniquePlug(plugins: Plugin[]): Plugin[] {
    return Array.from(new Set(plugins.map((p) => p.info.url))).map((url) => this.findPlugin(url))
      .filter((p): p is Plugin => p !== undefined);
  }

  private uniqueUrlByIsLoad(): Plugin[] {
    return this.plugins.filter((value, index, self) => {
      const found = self.find((v) => v.info.url === value.info.url && v.info.isLoad);
      if (found) {
        return found === value;
      }
      return self.findIndex((v) => v.info.url === value.info.url) === index;
    }).sort((a, b) => {
      if (a.info.isLoad && !b.info.isLoad) return -1;
      if (!a.info.isLoad && b.info.isLoad) return 1;
      return a.info.url.localeCompare(b.info.url);
    });
  }

  private async bufWrite(bufname: string, data: string[], opts?: { filetype?: string }) {
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
        if (this.option.notify) {
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
        if (this.option.notify) {
          await notify(this.denops, output.join("\r"));
        }
      }
    });
  }

  /**
   * Install plugins
   */
  public async install(url?: string) {
    if (url) {
      const p = this.findPlugin(url);
      if (p == undefined) return;
      await this._install(p);
    } else {
      for (const p of this.plugins) {
        await this._install(p);
      }
    }

    if (this.#installLogs.length > 0) {
      await this.bufWrite("dvpm://install", this.#installLogs);
    }
  }

  /**
   * Update plugins
   */
  public async update(url?: string) {
    if (this.option.notify) {
      await notify(this.denops, `Update start`);
    } else {
      await echo(this.denops, `Update start`);
    }
    if (url) {
      const p = this.findPlugin(url);
      if (p == undefined) return;
      await this._update(p);
    } else {
      for (const p of this.uniquePlug(this.plugins)) {
        await this._update(p);
      }
    }

    this.denops.call("denops#cache#update");

    if (this.#updateLogs.length > 0) {
      await this.bufWrite("dvpm://update", this.#updateLogs, { filetype: "diff" });
    }
    if (this.option.notify) {
      await notify(this.denops, `Update done`);
    } else {
      await echo(this.denops, `Update done`);
    }
  }

  /**
   * List plugins
   */
  public list(): Plugin[] {
    return this.uniqueUrlByIsLoad();
  }

  /**
   * List plugins to buffer
   */
  public async bufWriteList() {
    const maxLen = this.maxUrlLen(this.plugins);
    const uniquePlug = this.uniqueUrlByIsLoad();
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

  /**
   * Add a plugin to dvpm list
   */
  public async add(plug: Plug) {
    try {
      logger().debug(`Add plugin: ${plug.url}`);
      const p = await Plugin.create(
        this.denops,
        plug,
        {
          base: this.option.base,
          debug: this.option.debug,
          profile: this.option.profile,
          logarg: this.option.logarg,
        },
      );
      this.#urls = [
        ...p.info.dependencies,
        p.info.url,
        ...this.#urls.filter((url) => !p.info.dependencies.includes(url) && url !== p.info.url),
      ];
      this.plugins.push(p);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * dvpm end function
   */
  public async end() {
    this.plugins = this.#urls.map((url) => this.findPlugin(url)).filter((p): p is Plugin =>
      p !== undefined
    );
    const enablePlugins = this.plugins.filter((p) => p.info.enabled);
    logger().debug(`Enable plugins: ${enablePlugins.map((p) => p.plug.url)}`);
    for (const p of enablePlugins) {
      if (!(await exists(p.info.dst, { isDirectory: true }))) {
        await this._install(p);
      }
      await p.addRuntimepath();
      await p.denopsPluginLoad();
      await p.before();
      await p.source();
      await p.after();
    }
    for (const p of enablePlugins) {
      await p.sourceAfter();
      this.#cacheScript.push(await p.cache());
    }
    if (this.#installLogs.length > 0) {
      await this.bufWrite("dvpm://install", this.#installLogs);
    }
    if (this.option.profile) {
      const maxLen = this.maxUrlLen(this.plugins);
      const sortedPlugins = this.plugins.filter((p) => p.info.isLoad)
        .sort((a, b) => b.info.elaps - a.info.elaps).map((p) =>
          sprintf(
            `%-${maxLen + listSpace}s : %s`,
            p.plug.url,
            `${Math.round(p.info.elaps * 1000) / 1000}`,
          )
        );
      this.totalElaps = performance.now() - this.totalElaps;
      await this.bufWrite("dvpm://profile", [
        sprintf(`%-${maxLen + listSpace}s : %s`, `url`, `elaps`),
        `${"-".repeat(maxLen + listSpace)} : ------`,
        ...sortedPlugins,
        `${"-".repeat(maxLen + listSpace)} : ------`,
        sprintf(
          `%-${maxLen + listSpace}s : %s`,
          `Total`,
          `${Math.round(this.totalElaps * 1000) / 1000}`,
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
    logger().debug(`doautocmd VimEnter`);
    await this.denops.cmd(`doautocmd VimEnter`);
    if (this.option.cache) {
      logger().debug(`Cache: ${this.option.cache}`);
      this.#cacheScript.unshift(`" This file is generated by dvpm.`);
      const seen = new Set<string>();
      await cache(this.denops, {
        script: this.#cacheScript.map((s) => s.split(/\r?\n/).map((l) => l.trim())).flat().filter(
          (line) => {
            if (line.match(/^set runtimepath\+=|^source |^luafile /)) {
              if (seen.has(line)) {
                return false;
              } else {
                seen.add(line);
                return true;
              }
            } else {
              return true;
            }
          },
        ).join("\n"),
        path: this.option.cache,
      });
    }
  }

  /**
   * Cache the script
   */
  public async cache(arg: { script: string; path: string }) {
    await cache(this.denops, { script: arg.script, path: arg.path });
  }
}
