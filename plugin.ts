// =============================================================================
// File        : plugin.ts
// Author      : yukimemi
// Last Change : 2025/03/22 14:58:56.
// =============================================================================

import * as fn from "jsr:@denops/std@7.5.0/function";
import * as op from "jsr:@denops/std@7.5.0/option";
import * as path from "jsr:@std/path@1.1.0";
import type { Bool, Plug, PlugInfo, PlugOption } from "./types.ts";
import type { Denops } from "jsr:@denops/std@7.5.0";
import { Git } from "./git.ts";
import { PlugInfoSchema, PlugOptionSchema, PlugSchema } from "./types.ts";
import { Result } from "npm:result-type-ts@2.2.0";
import { Semaphore } from "jsr:@lambdalisue/async@2.1.1";
import { cmdOutToString, convertUrl, executeFile, getExecuteStr, parseUrl } from "./util.ts";
import { echo, execute } from "jsr:@denops/std@7.5.0/helper";
import { exists, expandGlob } from "jsr:@std/fs@1.0.18";
import { logger } from "./logger.ts";
import { z } from "npm:zod@3.25.47";

export class Plugin {
  static mutex: Semaphore = new Semaphore(1);
  public initialClone: boolean;
  public info: PlugInfo;

  constructor(
    public denops: Denops,
    public plug: Plug,
    public option: PlugOption,
  ) {
    this.plug = PlugSchema.parse(this.plug);
    this.option = PlugOptionSchema.parse(this.option);
    this.info = PlugInfoSchema.parse({
      dst: "",
      ...this.plug,
    });
    this.initialClone = false;
  }

  /**
   * Creates a new Plugin instance
   */
  public static async create(
    denops: Denops,
    plug: Plug,
    option: PlugOption,
  ): Promise<Plugin> {
    const p = new Plugin(denops, plug, option);

    p.info.url = convertUrl(p.plug.url);
    logger().debug(`[create] url ${p.info.url}`);

    if (p.plug.dst) {
      logger().debug(`[create] set dst to ${p.plug.dst}`);
      p.info.dst = z.string().parse(await fn.expand(p.denops, p.plug.dst));
    } else {
      const { hostname, pathname } = parseUrl(p.info.url);
      p.info.dst = path.join(option.base, hostname, pathname);
    }
    p.info.enabled = await p.is(p.info.enabled) &&
      (p.option.profiles.length === 0 ||
        (p.option.profiles.length > 0 &&
          p.option.profiles.some((profile) => p.info.profiles.includes(profile))));
    p.info.clone = await p.is(p.info.enabled ? p.info.enabled : p.info.clone);

    p.info.cache.enabled = await p.is(p.info.cache.enabled);
    if (
      p.info.cache?.before || p.info.cache?.after || p.info.cache?.beforeFile ||
      p.info.cache?.afterFile
    ) {
      p.info.cache.enabled = true;
    }

    if (p.info.dependencies.length > 0) {
      p.info.dependencies = p.info.dependencies.map((d) => convertUrl(d));
    }

    if (p.info.dependencies.includes(p.info.url)) {
      logger().error(`${p.info.url} is a dependency of itself !`);
    }
    return p;
  }

  private async is(b: Bool) {
    if (typeof b === "boolean") {
      return b;
    }
    return await b({ denops: this.denops, info: this.info });
  }

  /**
   * Cache a plugin and plugin config
   */
  public async cache(): Promise<string> {
    try {
      logger().debug(`[cache] ${this.info.url} start !`);
      if (
        !this.info.enabled || !this.info.cache.enabled
      ) {
        return "";
      }
      this.info.isCache = true;
      const cacheStr = [`set runtimepath+=${this.info.dst}`];
      cacheStr.push(this.info.cache?.before || "");
      if (this.info.cache?.beforeFile) {
        cacheStr.push(await getExecuteStr(this.denops, this.info.cache.beforeFile));
      }
      for await (const file of expandGlob(`${this.info.dst}/plugin/**/*.vim`)) {
        cacheStr.push(`source ${file.path}`);
      }
      for await (const file of expandGlob(`${this.info.dst}/plugin/**/*.lua`)) {
        cacheStr.push(`luafile ${file.path}`);
      }
      if (this.info.cache?.afterFile) {
        cacheStr.push(await getExecuteStr(this.denops, this.info.cache.afterFile));
      }
      cacheStr.push(this.info.cache?.after || "");
      return cacheStr.join("\n");
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[cache] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
      return "";
    } finally {
      logger().debug(`[cache] ${this.info.url} end !`);
    }
  }

  /**
   * Add plugin to runtimepath
   */
  public async addRuntimepath(): Promise<boolean> {
    try {
      logger().debug(`[addRuntimepath] ${this.info.url} start !`);
      let added = false;
      if (!this.info.enabled) {
        return added;
      }
      await Plugin.mutex.lock(async () => {
        const rtp = (await op.runtimepath.get(this.denops)).split(",");
        if (!rtp.includes(this.info.dst)) {
          added = true;
          await op.runtimepath.set(this.denops, `${rtp},${this.info.dst}`);
        }
      });
      this.info.isLoad = true;
      return added;
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[addRuntimepath] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
      return false;
    } finally {
      logger().debug(`[addRuntimepath] ${this.info.url} end !`);
    }
  }

  /**
   * plugin config before adding to runtimepath
   */
  public async before() {
    try {
      logger().debug(`[before] ${this.info.url} start !`);
      if (this.info.before) {
        logger().debug(`[before] ${this.info.url} execute before !`);
        await this.info.before({ denops: this.denops, info: this.info });
      }
      if (this.info.beforeFile) {
        logger().debug(`[before] ${this.info.url} execute beforeFile !`);
        await executeFile(this.denops, this.info.beforeFile);
      }
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[before] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
    } finally {
      logger().debug(`[before] ${this.info.url} end !`);
    }
  }
  /**
   * plugin config after adding to runtimepath
   */
  public async after() {
    try {
      logger().debug(`[after] ${this.info.url} start !`);
      if (this.info.after) {
        logger().debug(`[after] ${this.info.url} execute after !`);
        await this.info.after({ denops: this.denops, info: this.info });
      }
      if (this.info.afterFile) {
        logger().debug(`[after] ${this.info.url} execute afterFile !`);
        await executeFile(this.denops, this.info.afterFile);
      }
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[after] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
    } finally {
      logger().debug(`[after] ${this.info.url} end !`);
    }
  }
  /**
   * plugin build config
   */
  public async build() {
    try {
      logger().debug(`[build] ${this.info.url} start !`);
      if (this.info.build) {
        logger().debug(`[build] ${this.info.url} execute build !`);
        await this.info.build({ denops: this.denops, info: this.info });
      }
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[build] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
    } finally {
      logger().debug(`[build] ${this.info.url} end !`);
    }
  }

  /**
   * source plugin
   */
  public async source() {
    try {
      logger().debug(`[source] ${this.info.url} start !`);
      await this.sourceVimPre();
      await this.sourceLuaPre();
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[source] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
    } finally {
      logger().debug(`[source] ${this.info.url} end !`);
    }
  }
  /**
   * source plugin config after adding to runtimepath
   */
  public async sourceAfter() {
    try {
      logger().debug(`[sourceAfter] ${this.info.url} start !`);
      await this.sourceVimAfter();
      await this.sourceLuaAfter();
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[sourceAfter] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
    } finally {
      logger().debug(`[sourceAfter] ${this.info.url} end !`);
    }
  }
  /**
   * Load denops plugin
   */
  public async denopsPluginLoad() {
    try {
      logger().debug(`[denopsPluginLoad] ${this.info.url} start !`);
      const target = `${this.info.dst}/denops/*/main.ts`;
      for await (const file of expandGlob(target)) {
        const name = path.basename(path.dirname(file.path));
        try {
          logger().debug(
            `[denopsPluginLoad] ${this.info.url} load name: [${name}], path: [${file.path}] !`,
          );
          await this.denops.call("denops#plugin#load", name, file.path);
        } catch (e) {
          if (e instanceof Error) {
            logger().error(`[denopsPluginLoad] ${this.info.url} ${e.message}, ${e.stack}`);
            console.error(`${this.info.url} ${e.message}, ${e.stack}`);
          }
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[denopsPluginLoad] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
    } finally {
      logger().debug(`[denopsPluginLoad] ${this.info.url} end !`);
    }
  }

  private async sourceVim(target: string) {
    for await (const file of expandGlob(target)) {
      logger().debug(`[sourceVim] ${this.info.url} source ${file.path} !`);
      await execute(this.denops, `source ${file.path}`);
    }
  }
  private async sourceVimPre() {
    await this.sourceVim(`${this.info.dst}/plugin/**/*.vim`);
    await this.sourceVim(`${this.info.dst}/ftdetect/**/*.vim`);
  }
  private async sourceVimAfter() {
    await this.sourceVim(`${this.info.dst}/after/plugin/**/*.vim`);
    await this.sourceVim(`${this.info.dst}/after/ftdetect/**/*.vim`);
  }
  private async sourceLua(target: string) {
    for await (const file of expandGlob(target)) {
      logger().debug(`[sourceLua] ${this.info.url} luafile ${file.path} !`);
      await execute(this.denops, `luafile ${file.path}`);
    }
  }
  private async sourceLuaPre() {
    await this.sourceLua(`${this.info.dst}/plugin/**/*.lua`);
    await this.sourceLua(`${this.info.dst}/ftdetect/**/*.lua`);
  }
  private async sourceLuaAfter() {
    await this.sourceLua(`${this.info.dst}/after/plugin/**/*.lua`);
    await this.sourceLua(`${this.info.dst}/after/ftdetect/**/*.lua`);
  }

  private async isHelptagsOld(docDir: string) {
    const txts: string[] = [];
    const tags: string[] = [];
    for await (const entry of expandGlob(docDir + "/*.{txt,[a-z][a-z]x}")) {
      txts.push(entry.path);
    }
    for await (const entry of expandGlob(docDir + "/tags{-[a-z][a-z],}")) {
      tags.push(entry.path);
    }
    const txtNewest = Math.max(...txts.map((txt) => Deno.statSync(txt).mtime?.getTime() ?? 0));
    const tagOldest = Math.min(...tags.map((tag) => Deno.statSync(tag).mtime?.getTime() ?? 0));
    return tags.length === 0 || txtNewest > tagOldest;
  }

  /**
   * Generate helptags
   */
  public async genHelptags() {
    const docDir = path.join(this.info.dst, "doc");
    if (!(await this.isHelptagsOld(docDir))) {
      return;
    }
    const escapeDocDir = await fn.fnameescape(this.denops, docDir);
    logger().debug(`[genHelptags] ${this.info.url} silent! helptags ${escapeDocDir} !`);
    await execute(
      this.denops,
      `silent! helptags ${escapeDocDir}`,
    );
  }

  /**
   * Install a plugin
   */
  public async install(): Promise<Result<string[], string[]>> {
    try {
      logger().debug(`[install] ${this.info.url} start !`);

      if (!this.info.clone) {
        return Result.success([]);
      }

      const gitDir = path.join(this.info.dst, ".git");
      if (await exists(gitDir)) {
        return Result.success([]);
      }

      const output = await Git.clone(
        this.info.url,
        this.info.dst,
        this.info.rev,
        this.info.depth,
      );
      if (output.success) {
        this.initialClone = true;
        await this.genHelptags();
        this.info.isUpdate = true;
        let returnMsg = `Git clone ${this.info.url}`;
        if (this.info.rev) {
          returnMsg += ` --branch=${this.info.rev}`;
        }
        if (this.info.depth != undefined && this.info.depth > 0) {
          returnMsg += ` --depth=${this.info.depth}`;
        }
        return Result.success([returnMsg]);
      }
      return Result.failure([
        `Failed to clone ${this.info.url}`,
        `stdout:`,
        ...cmdOutToString(output.stdout),
        `stderr:`,
        ...cmdOutToString(output.stderr),
      ]);
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[install] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
      return Result.failure([`Failed to install ${this.info.url}`]);
    } finally {
      logger().debug(`[install] ${this.info.url} end !`);
    }
  }

  /**
   * Update a plugin
   */
  public async update(): Promise<Result<string[], string[]>> {
    try {
      logger().debug(`[update] ${this.info.url} start !`);

      if (!this.info.clone) {
        return Result.success([]);
      }
      const git = new Git(this.info.dst);
      const beforeRev = await git.getRevision();
      this.info.rev
        ? await echo(this.denops, `Update ${this.info.url}, branch: ${this.info.rev}`)
        : await echo(this.denops, `Update ${this.info.url}`);
      const output = await git.pull(this.info.rev);
      const afterRev = await git.getRevision();
      await this.genHelptags();
      if (output.success) {
        if (beforeRev !== afterRev) {
          this.info.isUpdate = true;
          const outputLog = await git.getLog(
            beforeRev,
            afterRev,
            this.option.logarg,
          );
          const outputDiff = await git.getDiff(
            beforeRev,
            afterRev,
          );
          if (outputLog.success) {
            const log = [
              `--- ○: ${this.info.dst} --------------------`,
              ...cmdOutToString(outputLog.stdout),
            ];
            if (outputDiff.success) {
              log.push(`---`);
              log.push(...cmdOutToString(outputDiff.stdout));
            }
            return Result.success(log);
          }
          return Result.success([
            `--- ×: ${this.info.dst} --------------------`,
            `Failed to git log ${this.info.dst}`,
            `stdout:`,
            ...cmdOutToString(outputLog.stdout),
            `stderr:`,
            ...cmdOutToString(outputLog.stderr),
          ]);
        }
        return Result.success([]);
      }
      return Result.failure([
        `--- ×: ${this.info.dst} --------------------`,
        `Failed to git pull ${this.info.url}`,
        `stdout:`,
        ...cmdOutToString(output.stdout),
        `stderr:`,
        ...cmdOutToString(output.stderr),
      ]);
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[update] ${this.info.url} ${e.message}, ${e.stack}`);
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
      }
      return Result.failure([`Failed to update ${this.info.url}`]);
    } finally {
      logger().debug(`[update] ${this.info.url} end !`);
    }
  }
}
