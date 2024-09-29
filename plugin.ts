// =============================================================================
// File        : plugin.ts
// Author      : yukimemi
// Last Change : 2024/09/29 11:53:07.
// =============================================================================

import * as fn from "jsr:@denops/std@7.2.0/function";
import * as op from "jsr:@denops/std@7.2.0/option";
import * as path from "jsr:@std/path@1.0.6";
import type { Bool, Plug, PlugInfo, PlugOption } from "./types.ts";
import type { Denops } from "jsr:@denops/std@7.2.0";
import { Git } from "./git.ts";
import { PlugSchema } from "./types.ts";
import { logger } from "./logger.ts";
import { Result } from "npm:result-type-ts@2.1.3";
import { Semaphore } from "jsr:@lambdalisue/async@2.1.1";
import { cmdOutToString, convertUrl, executeFile, getExecuteStr } from "./util.ts";
import { echo, execute } from "jsr:@denops/std@7.2.0/helper";
import { exists, expandGlob } from "jsr:@std/fs@1.0.4";
import { z } from "npm:zod@3.23.8";

export class Plugin {
  static mutex: Semaphore = new Semaphore(1);

  public info: PlugInfo;

  constructor(
    public denops: Denops,
    public plug: Plug,
    public option: PlugOption,
  ) {
    this.plug = PlugSchema.parse(this.plug);
    this.info = {
      ...this.plug,
      dst: "",
    };
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
      p.info.dst = z.string().parse(await fn.expand(denops, p.plug.dst));
    } else {
      const url = new URL(p.plug.url);
      p.info.dst = path.join(option.base, url.hostname, url.pathname);
    }
    p.info.clone = await p.is(p.plug.clone);
    p.info.enabled = await p.is(p.plug.enabled) && p.info.clone;

    if (
      p.info.cache?.before || p.info.cache?.after || p.info.cache?.beforeFile ||
      p.info.cache?.afterFile
    ) {
      p.info.cache.enabled = true;
    }

    if (p.info.dependencies.length > 0) {
      p.info.dependencies = p.info.dependencies.map((d) => convertUrl(d));
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
      logger().error(e);
      return "";
    } finally {
      logger().debug(`[cache] ${this.info.url} end !`);
    }
  }

  /**
   * Add plugin to runtimepath
   */
  public async addRuntimepath(): Promise<boolean> {
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
    logger().debug(`[addRuntimepath] ${this.info.url} end !`);
    return added;
  }

  /**
   * plugin config before adding to runtimepath
   */
  public async before() {
    if (this.info.before) {
      logger().debug(`[before] ${this.info.url} start !`);
      await this.info.before({ denops: this.denops, info: this.info });
      logger().debug(`[before] ${this.info.url} end !`);
    }
    if (this.info.beforeFile) {
      await executeFile(this.denops, this.info.beforeFile);
    }
  }
  /**
   * plugin config after adding to runtimepath
   */
  public async after() {
    if (this.info.after) {
      logger().debug(`[after] ${this.info.url} start !`);
      await this.info.after({ denops: this.denops, info: this.info });
      logger().debug(`[after] ${this.info.url} end !`);
    }
    if (this.info.afterFile) {
      await executeFile(this.denops, this.info.afterFile);
    }
  }
  /**
   * plugin build config
   */
  public async build() {
    if (this.info.build && this.info.enabled) {
      logger().debug(`[build] ${this.info.url} start !`);
      await this.info.build({ denops: this.denops, info: this.info });
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
      logger().error(e);
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
      logger().error(e);
    } finally {
      logger().debug(`[sourceAfter] ${this.info.url} end !`);
    }
  }
  /**
   * Load denops plugin
   */
  public async denopsPluginLoad() {
    const target = `${this.info.dst}/denops/*/main.ts`;
    for await (const file of expandGlob(target)) {
      const name = path.basename(path.dirname(file.path));
      try {
        await this.denops.call("denops#plugin#load", name, file.path);
      } catch (e) {
        logger().error(e);
      }
    }
  }

  private async sourceVim(target: string) {
    for await (const file of expandGlob(target)) {
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
    await execute(
      this.denops,
      `silent! helptags ${await fn.fnameescape(this.denops, docDir)}`,
    );
  }

  /**
   * Install a plugin
   */
  public async install(): Promise<Result<string[], string[]>> {
    const gitDir = path.join(this.info.dst, ".git");
    if (await exists(gitDir)) {
      return Result.success([]);
    }

    if (!this.info.clone) {
      return Result.success([]);
    }

    const output = await Git.clone(
      this.info.url,
      this.info.dst,
      this.info.rev,
      this.info.depth,
    );
    if (output.success) {
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
  }

  /**
   * Update a plugin
   */
  public async update(): Promise<Result<string[], string[]>> {
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
        await this.build();
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
      await this.build();
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
  }
}
