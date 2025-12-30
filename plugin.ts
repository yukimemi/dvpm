// =============================================================================
// File        : plugin.ts
// Author      : yukimemi
// Last Change : 2025/12/27 23:00:00.
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

export class Plugin {
  static mutex: Semaphore = new Semaphore(1);
  public initialClone: boolean;
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
      p.info.dst = type("string").assert(await fn.expand(p.denops, p.plug.dst));
    } else {
      const { hostname, pathname } = parseUrl(p.info.url);
      p.info.dst = path.join(option.base, hostname, pathname);
    }
    p.info.enabled = await p.is(p.info.enabled as Bool) &&
      (
        p.option.profiles.length === 0 ||
        (
          p.option.profiles.length > 0 &&
          p.option.profiles.some((profile: string) => p.info.profiles.includes(profile))
        )
      );
    p.info.clone = await p.is((p.info.enabled ? p.info.enabled : p.info.clone) as Bool);

    p.info.cache.enabled = await p.is(p.info.cache.enabled as Bool);
    if (
      p.info.cache?.before || p.info.cache?.after || p.info.cache?.beforeFile ||
      p.info.cache?.afterFile
    ) {
      p.info.cache.enabled = true;
    }

    if (p.info.dependencies.length > 0) {
      p.info.dependencies = p.info.dependencies.map((d: string) => convertUrl(d));
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
      await this.sourcePre();
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
      await this.sourcePost();
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
        this.info.isUpdate = true;
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
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
        throw e;
      }
      throw new Error(`Failed to install ${this.info.url}`);
    } finally {
      logger().debug(`[install] ${this.info.url} end !`);
    }
  }

  /**
   * Update a plugin
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
      const output = await git.pull(this.info.rev);
      const afterRev = await git.getRevision();
      await this.genHelptags();
      if (output.success) {
        if (beforeRev !== afterRev) {
          this.info.isUpdate = true;
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
        console.error(`${this.info.url} ${e.message}, ${e.stack}`);
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
