// =============================================================================
// File        : dvpm.ts
// Author      : yukimemi
// Last Change : 2026/01/01 21:26:13.
// =============================================================================

import * as autocmd from "@denops/std/autocmd";
import * as buffer from "@denops/std/buffer";
import * as fn from "@denops/std/function";
import * as mapping from "@denops/std/mapping";
import type { Denops } from "@denops/std";
import type { OpenOptions } from "@denops/std/buffer";
import { Plugin } from "./plugin.ts";
import { Semaphore } from "@core/asyncutil";
import { batch } from "@denops/std/batch";
import { cache, convertUrl, notify } from "./util.ts";
import { echo, execute } from "@denops/std/helper";
import { send } from "@denops/std/helper/keymap";
import { logger } from "./logger.ts";
import { sprintf } from "@std/fmt/printf";
import {
  type CmdParams,
  CommandSchema,
  type DvpmOption,
  DvpmOptionSchema,
  type KeyMap,
  KeyMapSchema,
  LoadArgsSchema,
  type LoadType,
  type Plug,
} from "./types.ts";
import { type } from "arktype";

const LIST_SPACE = 3;
const SEP = " : ";
const COL_WIDTH_BOOL = 7;

/**
 * Dvpm class is the main manager for Vim/Neovim plugins.
 */
export class Dvpm {
  #semaphore: Semaphore;
  #cacheScript: string[] = [];
  #installLogs: string[] = [];
  #updateLogs: string[] = [];

  /**
   * Whether a plugin was installed or updated during the current session.
   */
  public isInstallOrUpdate = false;

  /**
   * List of managed plugins.
   */
  public plugins: Plugin[] = [];

  /**
   * Total elapsed time for processing in milliseconds.
   */
  public totalElaps = 0;

  /**
   * Creates a new Dvpm instance.
   *
   * @param denops - Denops instance.
   * @param option - Dvpm options.
   */
  constructor(
    public denops: Denops,
    public option: DvpmOption,
  ) {
    this.totalElaps = performance.now();
    this.option = DvpmOptionSchema.assert(this.option);
    this.#semaphore = new Semaphore(type("number").assert(this.option.concurrency));
  }

  /**
   * Creates a new Dvpm instance and starts the plugin management process.
   * This also sets up the necessary Denops dispatcher and Vim commands.
   *
   * @param denops - Denops instance.
   * @param option - Dvpm options.
   * @returns A new Dvpm instance.
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
          await dvpm.update(type("string").assert(url));
        } else {
          await dvpm.update();
        }
      },

      async bufWriteList(): Promise<void> {
        await dvpm.bufWriteList();
      },

      async load(url: unknown, loadType: unknown, arg: unknown, params?: unknown): Promise<void> {
        const args = LoadArgsSchema.assert({ url, loadType, arg, params });
        await dvpm.load(args.url, args.loadType, args.arg, args.params);
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
      logger().debug(`[findPlugin] ${url} plugin is not found !`);
    }
    return p;
  }

  private maxUrlLen(plugins: Plugin[]): number {
    return plugins.reduce((prev, cur) => prev.plug.url.length < cur.plug.url.length ? cur : prev)
      .plug.url.length;
  }

  private uniqueUrlByIsLoad(): Plugin[] {
    const map = new Map<string, Plugin>();

    for (const p of this.plugins) {
      const existing = map.get(p.info.url);
      if (!existing) {
        map.set(p.info.url, p);
      } else {
        if (p.info.isLoad && !existing.info.isLoad) {
          map.set(p.info.url, p);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
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
        return;
      }
      const p = pluginMap.get(url);
      if (p == undefined) {
        logger().warn(`[updateCache] Cache dependency error: plugin not found: ${url}`);
        return;
      }
      p.info.cache.enabled = true;
      p.info.dependencies?.forEach((dependency: string) =>
        enableCache(dependency, currentDepth + 1)
      );
    };

    plugins.forEach((p) => {
      if (p.info.cache.enabled) {
        p.info.dependencies?.forEach((dependency: string) => enableCache(dependency, 0));
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
        return;
      }
      if (seen.has(url)) {
        return;
      }
      const p = this.findPlugin(url);
      if (p == undefined) {
        logger().error(`[resolveDependencies] ${url} is not found in plugin list !`);
        return;
      }
      if (!p.info.enabled) {
        logger().debug(`[resolveDependencies] ${url} is disabled !`);
        return;
      }
      if (p.info.dependencies) {
        p.info.dependencies.forEach((dependency: string) => resolve(dependency, currentDepth + 1));
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
      });
    }
  }

  private async bufWrite(
    bufname: string,
    data: string[],
    filetype?: string,
    openOptions?: OpenOptions,
  ): Promise<number> {
    const buf = await buffer.open(this.denops, bufname, openOptions);
    await batch(this.denops, async (denops) => {
      await fn.setbufvar(denops, buf.bufnr, "&buftype", "nofile");
      await fn.setbufvar(denops, buf.bufnr, "&swapfile", 0);
      if (filetype) {
        await fn.setbufvar(denops, buf.bufnr, "&filetype", filetype);
      }
      await buffer.replace(denops, buf.bufnr, data);
      await buffer.concrete(denops, buf.bufnr);
    });
    return buf.bufnr;
  }

  private async runPluginTask(
    p: Plugin,
    taskName: "install" | "update",
    task: () => Promise<string[]>,
    logs: string[],
  ) {
    await this.#semaphore.lock(async () => {
      try {
        const output = await task();
        if (output.length > 0) {
          this.isInstallOrUpdate = true;
          logs.push(...output);
          if (this.option.notify) {
            await notify(this.denops, output.join("\r"));
          }
        }
      } catch (e) {
        if (e instanceof Error) {
          logger().error(`[${taskName}] ${p.info.url} ${e.message}, ${e.stack}`);
          logs.push(e.message);
          if (this.option.notify) {
            await notify(this.denops, e.message.replace(/\n/g, "\r"));
          }
        }
      } finally {
        if (taskName === "update") {
          await p.build();
        }
      }
    });
  }

  /**
   * Install managed plugins.
   *
   * @param url - If specified, only the plugin with this URL will be installed.
   */
  public async install(url?: string) {
    if (url) {
      const p = this.findPlugin(url);
      if (p == undefined) return;
      await this.runPluginTask(p, "install", () => p.install(), this.#installLogs);
    } else {
      await Promise.all(
        this.plugins.map((p) =>
          this.runPluginTask(p, "install", () => p.install(), this.#installLogs)
        ),
      );
    }
  }

  /**
   * Update managed plugins.
   *
   * @param url - If specified, only the plugin with this URL will be updated.
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
      await this.runPluginTask(p, "update", () => p.update(), this.#updateLogs);
    } else {
      await Promise.all(
        this.plugins.map((p) =>
          this.runPluginTask(p, "update", () => p.update(), this.#updateLogs)
        ),
      );
    }

    if (this.#updateLogs.length > 0) {
      const bufnr = await this.bufWrite("dvpm://update", this.#updateLogs, "diff", {
        opener: "tabedit",
      });
      const winid = await fn.bufwinid(this.denops, bufnr);
      if (winid !== -1) {
        await fn.win_execute(this.denops, winid, "setlocal foldmethod=marker | normal! zM");
      }
    }
    if (this.option.notify) {
      await notify(this.denops, `Update done`);
    } else {
      await echo(this.denops, `Update done`);
    }
  }

  /**
   * Returns a list of unique plugins, filtered by their load status.
   *
   * @returns List of Plugin instances.
   */
  public list(): Plugin[] {
    return this.uniqueUrlByIsLoad();
  }

  /**
   * Writes the list of plugins to a special Vim buffer (`dvpm://list`).
   */
  public async bufWriteList() {
    const maxLen = this.maxUrlLen(this.plugins);
    const uniquePlug = this.uniqueUrlByIsLoad();
    const maxProfileLen = uniquePlug.reduce((max, p) => {
      const len = (p.info.profiles?.join(",") || "").length;
      return len > max ? len : max;
    }, 0);
    const hasProfiles = maxProfileLen > 0;
    const profileHeaderLen = Math.max(maxProfileLen, "profiles".length);

    const columns = [
      {
        label: "url",
        width: maxLen + LIST_SPACE,
        get: (p: Plugin) => p.plug.url,
      },
      {
        label: "isLoad",
        width: COL_WIDTH_BOOL,
        get: (p: Plugin) => `${p.info.isLoad}`,
      },
      {
        label: "isCache",
        width: COL_WIDTH_BOOL,
        get: (p: Plugin) => `${p.info.isCache}`,
      },
      {
        label: "lazy",
        width: COL_WIDTH_BOOL,
        get: (p: Plugin) =>
          `${p.info.lazy || p.info.cmd || p.info.event || p.info.ft || p.info.keys ? true : false}`,
      },
      {
        label: "isClone",
        width: COL_WIDTH_BOOL,
        get: (p: Plugin) => `${p.info.clone}`,
      },
    ];

    if (hasProfiles) {
      columns.push({
        label: "profiles",
        width: profileHeaderLen,
        get: (p: Plugin) => p.info.profiles?.join(",") || "",
      });
    }

    const header = columns.map((c) => sprintf(`%-${c.width}s`, c.label)).join(SEP);
    const separator = columns.map((c) => "-".repeat(c.width)).join(SEP);
    const rows = uniquePlug.map((p) =>
      columns.map((c) => sprintf(`%-${c.width}s`, c.get(p))).join(SEP)
    );

    const rowEndSeparator = columns.map((c) => "-".repeat(c.width)).join(SEP);
    // Length of "url" column + separator + "isLoad" column
    const countSeparatorLen = columns[0].width + SEP.length + columns[1].width;

    await this.bufWrite("dvpm://list", [
      header,
      separator,
      ...rows,
      rowEndSeparator,
      sprintf(
        `%-${maxLen + LIST_SPACE}s${SEP}%s`,
        `Loaded count`,
        `${uniquePlug.filter((p) => p.info.isLoad).length}`,
      ),
      sprintf(
        `%-${maxLen + LIST_SPACE}s${SEP}%s`,
        `Not loaded count`,
        `${uniquePlug.filter((p) => !p.info.isLoad).length}`,
      ),
      rowEndSeparator.slice(0, countSeparatorLen),
      sprintf(
        `%-${maxLen + LIST_SPACE}s${SEP}%s`,
        `Total plugin count`,
        `${uniquePlug.length}`,
      ),
    ]);
  }

  public async uninstall(_url: string) {
    // TODO: Not implemented
  }

  /**
   * Add a plugin to the management list.
   *
   * @param plug - Plugin definition.
   */
  public async add(plug: Plug) {
    try {
      logger().debug(`[add] Add plugin: ${plug.url}`);
      const p = await Plugin.create(
        this.denops,
        plug,
        {
          base: this.option.base,
          profiles: type("string[]").assert(this.option.profiles),
          logarg: type("string[]").assert(this.option.logarg),
        },
      );
      this.plugins.push(p);
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[add] ${plug.url} ${e.message}, ${e.stack}`);
      }
    }
  }

  /**
   * Finalizes the plugin management process.
   * This includes resolving dependencies, installing missing plugins,
   * adding to runtimepath, sourcing configurations, and generating cache.
   */
  public async end() {
    try {
      logger().debug(`[end] Dvpm end start !`);
      const enabledPlugins = this.resolveDependencies(this.plugins);
      await this.install();

      const isLazy = (p: Plugin) =>
        p.info.lazy || p.info.cmd || p.info.event || p.info.ft || p.info.keys;
      const eagerPluginsSet = new Set<Plugin>();
      const lazyPluginsSet = new Set<Plugin>();

      for (const p of enabledPlugins) {
        if (isLazy(p)) {
          lazyPluginsSet.add(p);
        } else {
          eagerPluginsSet.add(p);
        }
      }

      let changed = true;
      while (changed) {
        changed = false;
        for (const p of lazyPluginsSet) {
          const dependent = Array.from(eagerPluginsSet).find((ep) =>
            ep.info.dependencies.includes(p.info.url)
          );
          if (dependent) {
            lazyPluginsSet.delete(p);
            eagerPluginsSet.add(p);
            changed = true;
          }
        }
      }

      const eagerPlugins = enabledPlugins.filter((p) => eagerPluginsSet.has(p));
      const lazyPlugins = enabledPlugins.filter((p) => lazyPluginsSet.has(p));

      for (const p of enabledPlugins) {
        await p.add();
      }

      logger().debug(`[end] Enable plugins: ${eagerPlugins.map((p) => p.info.url).join(", ")}`);
      logger().debug(`[end] Lazy plugins: ${lazyPlugins.map((p) => p.info.url).join(", ")}`);
      await this.loadPlugins(eagerPlugins);
      await this.fire(lazyPlugins);

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
      logger().debug(`[end] doautocmd VimEnter`);
      await this.denops.cmd(`doautocmd VimEnter`);
      if (this.#installLogs.length > 0) {
        await this.bufWrite("dvpm://install", this.#installLogs, undefined, {
          opener: "tabedit",
        });
      }
      if (this.option.cache) {
        await this.generateCache(enabledPlugins);
      }
      this.checkPluginUrlDuplicates(this.plugins);
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[end] ${e.message}, ${e.stack}`);
      }
    } finally {
      this.totalElaps = performance.now() - this.totalElaps;
      logger().debug(`[end] Dvpm end end ! ${this.totalElaps}`);
    }
  }

  public async load(url: string, loadType: LoadType, arg: string, params?: CmdParams) {
    const p = this.findPlugin(url);
    if (!p) return;
    if (p.info.isLoad) return;

    if (loadType === "cmd") {
      await this.denops.cmd(
        `if exists(':${arg}') == 2 | exe 'delcommand ${arg}' | endif`,
      );
    }
    if (loadType === "keys") {
      // No unmap here to avoid potential timing issues
    }

    const pluginsToLoad: Plugin[] = [];
    const collectDependencies = (plugin: Plugin) => {
      if (plugin.info.isLoad) return;
      if (plugin.info.dependencies) {
        for (const depUrl of plugin.info.dependencies) {
          const dep = this.findPlugin(depUrl);
          if (dep && !dep.info.isLoad) {
            collectDependencies(dep);
          }
        }
      }
      if (!pluginsToLoad.includes(plugin)) {
        pluginsToLoad.push(plugin);
      }
    };
    collectDependencies(p);

    await this.loadPlugins(pluginsToLoad);

    if (loadType === "cmd") {
      const p = params;
      let cmd = arg;
      if (p) {
        // Construct command with params
        if (p.range && p.range > 0) {
          if (p.line1 && p.line2 && p.line1 !== p.line2) {
            cmd = `${p.line1},${p.line2}${cmd}`;
          } else if (p.line1) {
            cmd = `${p.line1}${cmd}`;
          } else if (p.count && p.count > 0) {
            cmd = `${p.count}${cmd}`;
          }
        }
        if (p.bang) {
          cmd += "!";
        }
        if (p.args) {
          cmd += ` ${p.args}`;
        }
      }
      await this.denops.cmd(`if exists(':${arg}') | exe '${cmd}' | endif`);
    }
    if (loadType === "keys") {
      const keys = Array.isArray(p.info.keys) ? p.info.keys : [p.info.keys];
      const keyMap = keys.find((k) => {
        const out = KeyMapSchema(k);
        return out instanceof type.errors ? k === arg : (out as KeyMap).lhs === arg;
      });
      const keyMapChecked = KeyMapSchema(keyMap);

      if (!(keyMapChecked instanceof type.errors)) {
        const km = keyMapChecked as KeyMap;
        const modes = Array.isArray(km.mode)
          ? km.mode as mapping.Mode[]
          : [km.mode ?? "n"] as mapping.Mode[];
        for (const mode of modes) {
          await mapping.map(
            this.denops,
            km.lhs,
            km.rhs,
            {
              mode,
              noremap: km.noremap ?? true,
              silent: km.silent ?? true,
              nowait: km.nowait,
              expr: km.expr,
            },
          );
        }
        const feedArg = await this.denops.call(
          "eval",
          `"${km.lhs.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\<")}"`,
        ) as string;
        await send(this.denops, { keys: feedArg, remap: true });
      } else {
        await mapping.unmap(this.denops, arg, { mode: "n" });
        const feedArg = await this.denops.call(
          "eval",
          `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\<")}"`,
        ) as string;
        await send(this.denops, { keys: feedArg, remap: true });
      }
    }
  }

  private async fire(plugins: Plugin[]) {
    const toVimLiteral = (s: string) => `'${s.replace(/'/g, "''").replace(/</g, "<lt>")}'`;
    await batch(this.denops, async (denops) => {
      for (const p of plugins) {
        if (p.info.cmd) {
          const cmds = Array.isArray(p.info.cmd) ? p.info.cmd : [p.info.cmd];
          for (const cmd of cmds) {
            let name: string;
            let complete = "file";
            if (typeof cmd === "string") {
              name = cmd;
            } else {
              const c = CommandSchema.assert(cmd);
              name = c.name;
              complete = c.complete ?? "file";
            }
            await denops.cmd(
              `command! -nargs=* -range -bang -complete=${complete} ${name} call denops#notify('${denops.name}', 'load', ['${p.info.url}', 'cmd', '${name}', {'args': <q-args>, 'bang': <q-bang>, 'line1': <line1>, 'line2': <line2>, 'range': <range>, 'count': <count>}])`,
            );
          }
        }
        if (p.info.event) {
          const events = Array.isArray(p.info.event) ? p.info.event : [p.info.event];
          await autocmd.define(
            denops,
            events,
            "*",
            `call denops#notify('${denops.name}', 'load', ['${p.info.url}', 'event', '${
              events.join(",")
            }'])`,
            { once: true },
          );
        }
        if (p.info.ft) {
          const fts = Array.isArray(p.info.ft) ? p.info.ft : [p.info.ft];
          await autocmd.define(
            denops,
            "FileType",
            fts,
            `call denops#notify('${denops.name}', 'load', ['${p.info.url}', 'ft', '${
              fts.join(",")
            }'])`,
            { once: true },
          );
        }
        if (p.info.keys) {
          const keys = Array.isArray(p.info.keys) ? p.info.keys : [p.info.keys];
          for (const key of keys) {
            if (typeof key === "string") {
              await mapping.map(
                denops,
                key,
                `<cmd>call denops#notify('${denops.name}', 'load', ['${p.info.url}', 'keys', ${
                  toVimLiteral(key)
                }])<CR>`,
                { mode: "n" },
              );
            } else {
              const modes = Array.isArray(key.mode)
                ? key.mode as mapping.Mode[]
                : [key.mode ?? "n"] as mapping.Mode[];
              for (const mode of modes) {
                await mapping.map(
                  denops,
                  key.lhs,
                  `<cmd>call denops#notify('${denops.name}', 'load', ['${p.info.url}', 'keys', ${
                    toVimLiteral(key.lhs)
                  }])<CR>`,
                  { mode },
                );
              }
            }
          }
        }
      }
    });
  }

  private async loadPlugins(plugins: Plugin[]) {
    for (const p of plugins) {
      try {
        const name = p.info.name;
        logger().debug(`[loadPlugins] ${p.info.url} start !`);
        await p.before();
        await autocmd.emit(this.denops, "User", `Dvpm:PreLoad:${name}`);
        const added = await p.addRuntimepath();
        if (added) {
          await p.source();
        }
        await p.denopsPluginLoad();
        await p.after();
        if (p.initialClone) {
          await p.build();
        }
        await autocmd.emit(this.denops, "User", `Dvpm:PostLoad:${name}`);
      } catch (e) {
        if (e instanceof Error) {
          logger().error(`[loadPlugins] ${p.info.url} ${e.message}, ${e.stack}`);
        }
      } finally {
        logger().debug(`[loadPlugins] ${p.info.url} end !`);
      }
    }
    for (const p of plugins) {
      try {
        logger().debug(`[loadPlugins] ${p.info.url} sourceAfter start !`);
        await p.sourceAfter();
      } catch (e) {
        if (e instanceof Error) {
          logger().error(`[loadPlugins] ${p.info.url} sourceAfter ${e.message}, ${e.stack}`);
        }
      } finally {
        logger().debug(`[loadPlugins] ${p.info.url} sourceAfter end !`);
      }
    }
  }

  private async generateCache(plugins: Plugin[]) {
    for (const p of this.updateCache(plugins)) {
      try {
        logger().debug(`[generateCache] ${p.info.url} start !`);
        this.#cacheScript.push(await p.cache());
      } catch (e) {
        if (e instanceof Error) {
          logger().error(`[generateCache] ${p.info.url} ${e.message}, ${e.stack}`);
        }
      } finally {
        logger().debug(`[generateCache] ${p.info.url} end !`);
      }
    }
    logger().debug(`[generateCache] Cache: ${this.option.cache}`);
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
        path: type("string").assert(this.option.cache),
      })
    ) {
      logger().debug(`[generateCache] Cache updated: ${this.option.cache}`);
      await autocmd.emit(this.denops, "User", "Dvpm:CacheUpdated:all");
    }
  }

  /**
   * Manually update the cache script.
   *
   * @param arg - Cache script and file path.
   * @returns True if cache was updated, false otherwise.
   */
  public async cache(arg: { script: string; path: string }): Promise<boolean> {
    return await cache(this.denops, { script: arg.script, path: arg.path });
  }
}
