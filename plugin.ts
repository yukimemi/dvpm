// =============================================================================
// File        : plugin.ts
// Author      : yukimemi
// Last Change : 2026/01/01 21:26:20.
// =============================================================================

import * as fn from "@denops/std/function";
import * as op from "@denops/std/option";
import * as path from "@std/path";
import type { Bool, Plug, PlugInfo, PlugOption } from "./types.ts";
import type { Denops } from "@denops/std";
import { Git } from "./git.ts";
import { PlugInfoSchema, PlugOptionSchema, PlugSchema } from "./types.ts";
import { Semaphore } from "@core/asyncutil";
import { cmdOutToString, convertUrl, executeFile, getExecuteStr, parseUrl } from "./util.ts";
import { echo, execute } from "@denops/std/helper";
import { exists, expandGlob } from "@std/fs";
import { logger } from "./logger.ts";
import { type } from "arktype";

/**
 * Plugin class represents a single Vim/Neovim plugin.
 */
export class Plugin {
  static mutex: Semaphore = new Semaphore(1);

  /**
   * Whether the plugin was cloned for the first time in the current session.
   */
  public initialClone: boolean;

  /**
   * Detailed plugin information.
   */
  public info: PlugInfo;

  constructor(
    public denops: Denops,
    public plug: Plug,
    public option: PlugOption,
  ) {
    this.plug = PlugSchema.assert(this.plug);
    this.option = PlugOptionSchema.assert(this.option);
    this.info = PlugInfoSchema.assert({
      dst: "",
      name: "",
      ...this.plug,
      lazy: this.plug.lazy ?? { enabled: false },
    });
    this.initialClone = false;
  }

  /**
   * Creates a new Plugin instance.
   *
   * @param denops - Denops instance.
   * @param plug - Plugin definition.
   * @param option - Plugin management options.
   * @returns A new Plugin instance.
   */
  public static async create(
    denops: Denops,
    plug: Plug,
    option: PlugOption,
  ): Promise<Plugin> {
    const p = new Plugin(denops, plug, option);

    p.info.url = convertUrl(p.plug.url);
    logger().debug(`[create] url ${p.info.url}`);

    await p.initDst();
    p.info.name = p.plug.name ?? path.basename(p.info.dst);
    await p.initEnabled();
    await p.initClone();
    await p.initCache();
    await p.initClean();
    await p.initLazy();
    p.initDependencies();

    return p;
  }

  private async initDst() {
    if (this.plug.dst) {
      logger().debug(`[create] set dst to ${this.plug.dst}`);
      this.info.dst = type("string").assert(await fn.expand(this.denops, this.plug.dst));
    } else {
      const { hostname, pathname } = parseUrl(this.info.url);
      this.info.dst = path.join(this.option.base, hostname, pathname);
    }
  }

  private async initEnabled() {
    this.info.enabled = await this.is(this.info.enabled as Bool) &&
      (
        this.option.profiles.length === 0 ||
        (
          this.option.profiles.length > 0 &&
          this.option.profiles.some((profile: string) => this.info.profiles.includes(profile))
        )
      );
  }

  private async initClone() {
    const enabled = this.info.enabled as boolean;
    this.info.clone = await this.is((enabled || this.info.clone) as Bool);
  }

  private async initCache() {
    this.info.cache.enabled = await this.is(this.info.cache.enabled as Bool);
    if (
      this.info.cache?.before || this.info.cache?.after || this.info.cache?.beforeFile ||
      this.info.cache?.afterFile
    ) {
      this.info.cache.enabled = true;
    }
  }

  private async initClean() {
    const clean = this.plug.clean !== undefined
      ? this.plug.clean
      : (this.plug.dst !== undefined ? false : this.option.clean);
    this.info.clean = await this.is(clean as Bool);
  }

  private async initLazy() {
    const lazy = this.info.lazy;
    if (lazy.cmd || lazy.event || lazy.ft || lazy.keys) {
      lazy.enabled = true;
    }
    lazy.enabled = await this.is(lazy.enabled as Bool);
  }

  private initDependencies() {
    if (this.info.dependencies.length > 0) {
      this.info.dependencies = this.info.dependencies.map((d: string) => convertUrl(d));
    }

    if (this.info.dependencies.includes(this.info.url)) {
      logger().error(`${this.info.url} is a dependency of itself !`);
    }
  }

  private async is(b: Bool) {
    if (typeof b === "boolean") {
      return b;
    }
    return await b({ denops: this.denops, info: this.info });
  }

  /**
   * Generates cache script for the plugin and its configurations.
   *
   * @returns Cache script string.
   */
  public async cache(): Promise<string> {
    if (!this.info.enabled || !this.info.cache.enabled) {
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
  }

  /**
   * Adds the plugin to Vim's runtimepath.
   *
   * @returns True if the plugin was added to runtimepath, false otherwise.
   */
  public async addRuntimepath(): Promise<boolean> {
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
    return added;
  }

  /**
   * Executes the `add` configuration.
   */
  public async add() {
    if (this.info.add) {
      logger().debug(`[add] ${this.info.url} execute add !`);
      await this.info.add({ denops: this.denops, info: this.info });
    }
    if (this.info.addFile) {
      logger().debug(`[add] ${this.info.url} execute addFile !`);
      await executeFile(this.denops, this.info.addFile);
    }
  }

  /**
   * Executes the `before` configuration.
   */
  public async before() {
    if (this.info.before) {
      logger().debug(`[before] ${this.info.url} execute before !`);
      await this.info.before({ denops: this.denops, info: this.info });
    }
    if (this.info.beforeFile) {
      logger().debug(`[before] ${this.info.url} execute beforeFile !`);
      await executeFile(this.denops, this.info.beforeFile);
    }
  }
  /**
   * Executes the `after` configuration.
   */
  public async after() {
    if (this.info.after) {
      logger().debug(`[after] ${this.info.url} execute after !`);
      await this.info.after({ denops: this.denops, info: this.info });
    }
    if (this.info.afterFile) {
      logger().debug(`[after] ${this.info.url} execute afterFile !`);
      await executeFile(this.denops, this.info.afterFile);
    }
  }
  /**
   * Executes the `build` configuration.
   */
  public async build() {
    if (this.info.build) {
      logger().debug(`[build] ${this.info.url} execute build !`);
      await this.info.build({ denops: this.denops, info: this.info });
    }
  }

  /**
   * Sources the plugin's Vim and Lua scripts.
   */
  public async source() {
    await this.sourcePre();
  }
  /**
   * Sources the plugin's configurations that should be executed after adding to runtimepath.
   */
  public async sourceAfter() {
    await this.sourcePost();
  }
  /**
   * Loads Denops plugins included in the plugin.
   */
  public async denopsPluginLoad() {
    const target = `${this.info.dst}/denops/*/main.ts`;
    for await (const file of expandGlob(target)) {
      const name = path.basename(path.dirname(file.path));
      logger().debug(
        `[denopsPluginLoad] ${this.info.url} load name: [${name}], path: [${file.path}] !`,
      );
      await this.denops.call("denops#plugin#load", name, file.path);
      await this.denops.call("denops#plugin#wait", name);
    }
  }

  private async sourceGlob(target: string) {
    for await (const file of expandGlob(target)) {
      logger().debug(`[sourceGlob] ${this.info.url} source ${file.path} !`);
      await executeFile(this.denops, file.path);
    }
  }

  private async sourcePre() {
    await this.sourceGlob(`${this.info.dst}/plugin/**/*.vim`);
    await this.sourceGlob(`${this.info.dst}/ftdetect/**/*.vim`);
    await this.sourceGlob(`${this.info.dst}/plugin/**/*.lua`);
    await this.sourceGlob(`${this.info.dst}/ftdetect/**/*.lua`);
  }

  private async sourcePost() {
    await this.sourceGlob(`${this.info.dst}/after/plugin/**/*.vim`);
    await this.sourceGlob(`${this.info.dst}/after/ftdetect/**/*.vim`);
    await this.sourceGlob(`${this.info.dst}/after/plugin/**/*.lua`);
    await this.sourceGlob(`${this.info.dst}/after/ftdetect/**/*.lua`);
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
   * Generates Vim helptags for the plugin's documentation.
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
   * Clones the plugin repository if it doesn't exist.
   *
   * @returns Clone logs.
   */
  public async install(): Promise<string[]> {
    try {
      logger().debug(`[install] ${this.info.url} start !`);

      if (!this.info.clone) {
        return [];
      }

      const gitDir = path.join(this.info.dst, ".git");
      if (await exists(gitDir)) {
        return [];
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
        this.info.isInstalled = true;
        let returnMsg = `Git clone ${this.info.url}`;
        if (this.info.rev) {
          returnMsg += ` --branch=${this.info.rev}`;
        }
        if (this.info.depth != undefined && this.info.depth > 0) {
          returnMsg += ` --depth=${this.info.depth}`;
        }
        return [returnMsg];
      }
      throw new Error([
        `Failed to clone ${this.info.url}`,
        `stdout:`,
        ...cmdOutToString(output.stdout),
        `stderr:`,
        ...cmdOutToString(output.stderr),
      ].join("\n"));
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[install] ${this.info.url} ${e.message}, ${e.stack}`);
        throw e;
      }
      throw new Error(`Failed to install ${this.info.url}`);
    } finally {
      logger().debug(`[install] ${this.info.url} end !`);
    }
  }

  /**
   * Updates the plugin repository.
   *
   * @returns Update logs and diffs.
   */
  public async update(): Promise<string[]> {
    try {
      logger().debug(`[update] ${this.info.url} start !`);

      if (!this.info.clone) {
        return [];
      }
      const git = new Git(this.info.dst);
      const beforeRev = await git.getRevision();
      this.info.rev
        ? await echo(this.denops, `Update ${this.info.url}, branch: ${this.info.rev}`)
        : await echo(this.denops, `Update ${this.info.url}`);
      const output = await git.pull(this.info.rev, this.info.clean as boolean);
      const afterRev = await git.getRevision();
      await this.genHelptags();
      if (output.success) {
        if (beforeRev !== afterRev) {
          this.info.isUpdated = true;
          return await this.generateUpdateLog(git, beforeRev, afterRev);
        }
        return [];
      }
      throw new Error([
        `================================================================================`,
        `Update failed: ${this.info.dst}`,
        `Failed to git pull ${this.info.url}`,
        `--------------------------------------------------------------------------------`,
        `Details: {{{`,
        `stdout:`,
        ...cmdOutToString(output.stdout),
        `stderr:`,
        ...cmdOutToString(output.stderr),
        `}}}`,
        `================================================================================`,
      ].join("\n"));
    } catch (e) {
      if (e instanceof Error) {
        logger().error(`[update] ${this.info.url} ${e.message}, ${e.stack}`);
        throw e;
      }
      throw new Error(`Failed to update ${this.info.url}`);
    } finally {
      logger().debug(`[update] ${this.info.url} end !`);
    }
  }

  private async generateUpdateLog(
    git: Git,
    beforeRev: string,
    afterRev: string,
  ): Promise<string[]> {
    const outputLog = await git.getLog(
      beforeRev,
      afterRev,
      this.option.logarg,
    );
    const outputDiffStat = await git.getDiffStat(
      beforeRev,
      afterRev,
    );
    const outputDiff = await git.getDiff(
      beforeRev,
      afterRev,
    );
    if (outputLog.success) {
      const log = [
        `================================================================================`,
        `Update: ${this.info.dst}`,
        `Old: ${beforeRev}`,
        `New: ${afterRev}`,
        `================================================================================`,
      ];

      if (outputDiffStat.success) {
        log.push(...cmdOutToString(outputDiffStat.stdout));
        log.push(
          `--------------------------------------------------------------------------------`,
        );
      }

      log.push(...cmdOutToString(outputLog.stdout));

      const diff = cmdOutToString(outputDiff.stdout);
      if (outputDiff.success && diff.some((l) => l.length > 0)) {
        log.push(
          `--------------------------------------------------------------------------------`,
        );
        log.push(`Diff details: {{{`);
        log.push(...diff);
        log.push(`}}}`);
      }
      return log;
    }
    throw new Error([
      `================================================================================`,
      `Update failed: ${this.info.dst}`,
      `Failed to git log ${this.info.dst}`,
      `--------------------------------------------------------------------------------`,
      `Details: {{{`,
      `stdout:`,
      ...cmdOutToString(outputLog.stdout),
      `stderr:`,
      ...cmdOutToString(outputLog.stderr),
      `}}}`,
      `================================================================================`,
    ].join("\n"));
  }
}
