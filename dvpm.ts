// =============================================================================
// File        : dvpm.ts
// Author      : yukimemi
// Last Change : 2025/05/06 11:57:02.
// =============================================================================

import * as autocmd from "jsr:@denops/std@7.5.1/autocmd";
import * as buffer from "jsr:@denops/std@7.5.1/buffer";
import * as fn from "jsr:@denops/std@7.5.1/function";
import type { Denops } from "jsr:@denops/std@7.5.1";
import { Plugin } from "./plugin.ts";
import { Semaphore } from "jsr:@lambdalisue/async@2.1.1";
import { cache, convertUrl, notify } from "./util.ts";
import { echo, execute } from "jsr:@denops/std@7.5.1/helper";
import { logger } from "./logger.ts";
import { sprintf } from "jsr:@std/fmt@1.0.8/printf";
import { type DvpmOption, DvpmOptionSchema, type Plug } from "./types.ts";
import { z } from "npm:zod@3.25.62";
import { batch } from "jsr:@denops/std@7.5.1/batch";

const listSpace = 3;

export class Dvpm {
  #semaphore: Semaphore;
  #cacheScript: string[] = [];
  #installLogs: string[] = [];
  #updateLogs: string[] = [];

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
    this.option = DvpmOptionSchema.parse(this.option);
    this.#semaphore = new Semaphore(z.number().parse(this.option.concurrency));
  }

  /**
   * Creates a new Dvpm instance with the given options
   */
  public static async begin(
    denops: Denops,
    option: DvpmOption,
  ): Promise<Dvpm> {
    logger().debug(`[begin] Dvpm begin start !`);
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

    logger().debug(`[begin] Dvpm begin end !`);
    return dvpm;
  }

  private findPlugin(url: string): Plugin | undefined {
    const u = convertUrl(url);
    const p = this.plugins.find((p) => p.info.url === u);
    if (p == undefined) {
      logger().debug(`${url} plugin is not found !`);
    }
    return p;
  }

  private maxUrlLen(plugins: Plugin[]): number {
    return plugins.reduce((prev, cur) => prev.plug.url.length < cur.plug.url.length ? cur : prev)
      .plug.url.length;
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

  private updateCache(plugins: Plugin[]) {
    const pluginMap = new Map(plugins.map((p) => [p.info.url, p]));
    const recursionDepthLimit = 100;

    const enableCache = (url: string, currentDepth: number): void => {
      if (currentDepth > recursionDepthLimit) {
        logger().error(
          `[updateCache] Maximum recursion depth exceeded! Possible circular dependency detected involving ${url}`,
        );
        console.error(
          `Maximum recursion depth exceeded! Possible circular dependency detected involving ${url}`,
        );
        return;
      }
      const p = pluginMap.get(url);
      if (p == undefined) {
        logger().warn(`[updateCache] Cache dependency error: plugin not found: ${url}`);
        console.warn(`Cache dependency error: plugin not found: ${url}`);
        return;
      }
      p.info.cache.enabled = true;
      p.info.dependencies?.forEach((dependency) => enableCache(dependency, currentDepth + 1));
    };

    plugins.forEach((p) => {
      if (p.info.cache.enabled) {
        p.info.dependencies?.forEach((dependency) => enableCache(dependency, 0));
      }
    });

    return plugins;
  }

  private resolveDependencies(plugins: Plugin[]): Plugin[] {
    const sortedPlugins: Plugin[] = [];
    const seen = new Set<string>();
    const recursionDepthLimit = 100;

    const resolve = (url: string, currentDepth: number): void => {
      if (currentDepth > recursionDepthLimit) {
        logger().error(
          `[resolveDependencies] Maximum recursion depth exceeded! Possible circular dependency detected involving ${url}`,
        );
        console.error(
          `Maximum recursion depth exceeded! Possible circular dependency detected involving ${url}`,
        );
        return;
      }
      if (seen.has(url)) {
        return;
      }
      const p = this.findPlugin(url);
      if (p == undefined) {
        logger().error(`[resolveDependencies] ${url} is not found in plugin list !`);
        console.error(`${url} is not found in plugin list !`);
        return;
      }
      if (!p.info.enabled) {
        logger().debug(`[resolveDependencies] ${url} is disabled !`);
        return;
      }
      if (p.info.dependencies) {
        p.info.dependencies.forEach((dependency) => resolve(dependency, currentDepth + 1));
      }
      sortedPlugins.push(p);
      seen.add(url);
    };

    plugins.forEach((p) => resolve(p.info.url, 0));

    return sortedPlugins;
  }

  private checkPluginUrlDuplicates(plugins: Plugin[]): void {
    const urlSet = new Set<string>();
    const duplicates = plugins.filter((p) => {
      if (urlSet.has(p.info.url)) {
        return true;
      } else {
        urlSet.add(p.info.url);
        return false;
      }
    });
    if (duplicates.length > 0) {
      duplicates.forEach((d) => {
        logger().warn(`[checkPluginUrlDuplicates] Duplicate plugin URLs detected: ${d.info.url}`);
        console.warn(`Duplicate plugin URLs detected: ${d.info.url}`);
      });
    }
  }

  private async bufWrite(bufname: string, data: string[], opts?: { filetype?: string }) {
    const buf = await buffer.open(this.denops, bufname);
    await batch(this.denops, async (denops) => {
      await fn.setbufvar(denops, buf.bufnr, "&buftype", "nofile");
      await fn.setbufvar(denops, buf.bufnr, "&swapfile", 0);
      if (opts?.filetype) {
        await fn.setbufvar(denops, buf.bufnr, "&filetype", opts.filetype);
      }
      await buffer.replace(denops, buf.bufnr, data);
      await buffer.concrete(denops, buf.bufnr);
    });
  }

  private async _install(p: Plugin) {
    await this.#semaphore.lock(async () => {
      try {
        const result = await p.install();
        const output = result.value ?? result.error ?? [];
        if (output.length > 0) {
          if (result.isSuccess) {
            this.isInstallOrUpdate = true;
          }
          this.#installLogs.push(...output);
          if (this.option.notify) {
            await notify(this.denops, output.join("\r"));
          }
        }
      } catch (e) {
        if (e instanceof Error) {
          logger().error(`[_install] ${p.info.url} ${e.message}, ${e.stack}`);
          console.error(`${p.info.url} ${e.message}, ${e.stack}`);
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
      await p.build();
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
      await Promise.all(this.plugins.map((p) => this._install(p)));
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
      await Promise.all(this.plugins.map((p) => this._update(p)));
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
          debug: z.boolean().parse(this.option.debug),
          profiles: z.array(z.string()).parse(this.option.profiles),
          logarg: z.array(z.string()).parse(this.option.logarg),
        },
      );
      this.plugins.push(p);
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[add] ${plug.url} ${e.message}, ${e.stack}`);
        console.error(`${plug.url} ${e.message}, ${e.stack}`);
      }
    }
  }

  /**
   * dvpm end function
   */
  public async end() {
    try {
      logger().debug(`[end] Dvpm end start !`);
      const enabledPlugins = this.resolveDependencies(this.plugins);
      await this.install();
      logger().debug(`Enable plugins: ${enabledPlugins.map((p) => p.info.url).join(", ")}`);
      for (const p of enabledPlugins) {
        const added = await p.addRuntimepath();
        await p.before();
        if (added) {
          await p.source();
        }
        await p.denopsPluginLoad();
        await p.after();
        if (p.initialClone) {
          await p.build();
        }
      }
      for (const p of enabledPlugins) {
        await p.sourceAfter();
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
      if (this.#installLogs.length > 0) {
        await this.bufWrite("dvpm://install", this.#installLogs);
      }
      if (this.option.cache) {
        for (const p of this.updateCache(enabledPlugins)) {
          this.#cacheScript.push(await p.cache());
        }
        logger().debug(`Cache: ${this.option.cache}`);
        this.#cacheScript.unshift(`" This file is generated by dvpm.`);
        const seen = new Set<string>();
        if (
          await cache(this.denops, {
            script: this.#cacheScript.map((s) => s.split(/\r?\n/).map((l) => l.trim())).flat()
              .filter(
                (line) => {
                  if (line.match(/^set runtimepath\+=|^source |^luafile /)) {
                    if (seen.has(line)) {
                      return false;
                    } else {
                      seen.add(line);
                      return true;
                    }
                  } else if (line.match(/^\s*$/)) {
                    return false;
                  } else {
                    return true;
                  }
                },
              ).join("\n"),
            path: this.option.cache,
          })
        ) {
          logger().debug(`Cache updated: ${this.option.cache}`);
          await autocmd.emit(this.denops, "User", "DvpmCacheUpdated");
        }
      }
      this.checkPluginUrlDuplicates(this.plugins);
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[end] ${e.message}, ${e.stack}`);
        console.error(`${e.message}, ${e.stack}`);
      }
    } finally {
      logger().debug(`[end] Dvpm end end !`);
    }
  }

  /**
   * Cache the script
   */
  public async cache(arg: { script: string; path: string }): Promise<boolean> {
    return await cache(this.denops, { script: arg.script, path: arg.path });
  }
}
