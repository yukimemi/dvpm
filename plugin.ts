import * as fn from "https://deno.land/x/denops_std@v5.0.1/function/mod.ts";
import * as op from "https://deno.land/x/denops_std@v5.0.1/option/mod.ts";
import * as path from "https://deno.land/std@0.201.0/path/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.1/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { echo, execute } from "https://deno.land/x/denops_std@v5.0.1/helper/mod.ts";
import { exists, expandGlob } from "https://deno.land/std@0.201.0/fs/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.6.0/mod.ts";
import { Result } from "https://esm.sh/result-type-ts@2.1.1";
import { Git } from "./git.ts";
import { cmdOutToString } from "./util.ts";

export type TrueFalse =
  | boolean
  | ((
    { denops, info }: { denops: Denops; info: PlugInfo },
  ) => Promise<boolean>);

export type Plug = {
  url: string;
  dst?: string;
  branch?: string;
  enabled?: TrueFalse;
  before?: (
    { denops, info }: { denops: Denops; info: PlugInfo },
  ) => Promise<void>;
  after?: (
    { denops, info }: { denops: Denops; info: PlugInfo },
  ) => Promise<void>;
  build?: (
    { denops, info }: { denops: Denops; info: PlugInfo },
  ) => Promise<void>;
  cache?: {
    enabled?: TrueFalse;
    before?: string;
    after?: string;
  };
  clone?: TrueFalse;
  dependencies?: Plug[];
};

export type PlugInfo = Plug & {
  isLoad: boolean;
  isUpdate: boolean;
  isCache: boolean;
  elaps: number;
};

export type PluginOption = {
  base: string;
  debug?: boolean;
  profile?: boolean;
  logarg?: string[];
};

export class Plugin {
  static mutex = new Semaphore(1);
  public info: PlugInfo;

  constructor(
    public denops: Denops,
    public plug: Plug,
    public pluginOption: PluginOption,
  ) {
    this.info = {
      ...plug,
      isLoad: false,
      isUpdate: false,
      isCache: false,
      elaps: 0,
    };
  }

  public static async create(
    denops: Denops,
    plug: Plug,
    pluginOption: PluginOption,
  ): Promise<Plugin> {
    const p = new Plugin(denops, plug, pluginOption);
    if (p.plug.url.startsWith("http") || p.plug.url.startsWith("git")) {
      p.info.url = p.plug.url;
    } else {
      p.info.url = `https://github.com/${p.plug.url}`;
    }
    const url = new URL(p.info.url);
    p.info.dst = path.join(pluginOption.base, url.hostname, url.pathname);

    if (p.plug.dst) {
      p.clog(`[create] ${p.info.dst} set dst to ${p.plug.dst}`);
      p.info.dst = ensure(await fn.expand(denops, p.plug.dst), is.String);
    }
    if (p.plug.enabled == undefined) {
      p.info.enabled = true;
    }
    if (await p.isTrueFalse(p.plug.clone, true) === false) {
      p.info.enabled = false;
      p.info.clone = false;
    } else {
      p.info.clone = true;
    }
    if (p.plug.cache?.before || p.plug.cache?.after) {
      p.info.cache = {
        enabled: true,
        ...p.info.cache,
      };
    }
    return p;
  }

  // deno-lint-ignore no-explicit-any
  private clog(data: any) {
    if (this.pluginOption.debug) {
      console.log(data);
    }
  }

  private async isTrueFalse(tf: TrueFalse | undefined, def: boolean) {
    if (tf == undefined) {
      return def;
    }
    if (is.Boolean(tf)) {
      return tf;
    }
    return await tf({ denops: this.denops, info: this.info });
  }

  private async isEnabled() {
    return await this.isTrueFalse(this.info.enabled, true);
  }

  private async isClone() {
    return await this.isTrueFalse(this.info.clone, true);
  }

  private async isCache() {
    return await this.isTrueFalse(this.info.cache?.enabled, false);
  }

  public async add() {
    try {
      this.clog(`[add] ${this.info.url} start !`);
      if (!(await this.isEnabled())) {
        return;
      }
      await this.before();
      await this.register();
      if (this.info.isLoad && this.info.isUpdate) {
        await this.build();
      }
      await this.after();
    } catch (e) {
      console.error(e);
    } finally {
      this.clog(`[add] ${this.info.url} end !`);
    }
  }

  public async cache(): Promise<string> {
    try {
      this.clog(`[cache] ${this.info.url} start !`);
      if (
        !(await this.isEnabled()) || !(await this.isCache())
      ) {
        return "";
      }
      this.info.isCache = true;
      return `
          ${this.info.cache?.before || ""}
          set runtimepath+=${this.info.dst}
          ${this.info.cache?.after || ""}
        `;
    } catch (e) {
      console.error(e);
      return "";
    } finally {
      this.clog(`[cache] ${this.info.url} end !`);
    }
  }

  public async end() {
    await this.sourceAfter();
  }

  public async register() {
    this.clog(`[register] ${this.info.url} start !`);
    let registered = false;
    let starttime = 0;
    await Plugin.mutex.lock(async () => {
      if (this.pluginOption.profile) {
        starttime = performance.now();
      }
      const rtp = (await op.runtimepath.get(this.denops)).split(",");
      if (!rtp.includes(ensure(this.info.dst, is.String))) {
        registered = true;
        await op.runtimepath.set(this.denops, `${rtp},${this.info.dst}`);
      }
    });
    if (registered) {
      await this.source();
      await this.registerDenops();
      if (this.pluginOption.profile) {
        this.info.elaps = performance.now() - starttime;
      }
    }
    this.info.isLoad = true;
    this.clog(`[register] ${this.info.url} end !`);
    return;
  }

  public async before() {
    if (this.info.before) {
      this.clog(`[before] ${this.info.url} start !`);
      await this.info.before({ denops: this.denops, info: this.info });
      this.clog(`[before] ${this.info.url} end !`);
    }
  }
  public async after() {
    if (this.info.after) {
      this.clog(`[after] ${this.info.url} start !`);
      await this.info.after({ denops: this.denops, info: this.info });
      this.clog(`[after] ${this.info.url} end !`);
    }
  }
  public async build() {
    if (this.info.build) {
      this.clog(`[build] ${this.info.url} start !`);
      await this.info.build({ denops: this.denops, info: this.info });
      this.clog(`[build] ${this.info.url} end !`);
    }
  }

  public async source() {
    try {
      this.clog(`[source] ${this.info.url} start !`);
      await this.sourceVimPre();
      await this.sourceLuaPre();
    } catch (e) {
      console.error(e);
    } finally {
      this.clog(`[source] ${this.info.url} end !`);
    }
  }
  public async sourceAfter() {
    try {
      this.clog(`[sourceAfter] ${this.info.url} start !`);
      await this.sourceVimAfter();
      await this.sourceLuaAfter();
    } catch (e) {
      console.error(e);
    } finally {
      this.clog(`[sourceAfter] ${this.info.url} end !`);
    }
  }

  private async sourceVim(target: string) {
    for await (const file of expandGlob(target)) {
      await execute(this.denops, `source ${file.path}`);
    }
  }
  private async sourceVimPre() {
    const target = `${this.info.dst}/plugin/**/*.vim`;
    await this.sourceVim(target);
  }
  private async sourceVimAfter() {
    const target = `${this.info.dst}/after/plugin/**/*.vim`;
    await this.sourceVim(target);
  }
  private async sourceLua(target: string) {
    for await (const file of expandGlob(target)) {
      await execute(this.denops, `luafile ${file.path}`);
    }
  }
  private async sourceLuaPre() {
    const target = `${this.info.dst}/plugin/**/*.lua`;
    await this.sourceLua(target);
  }
  private async sourceLuaAfter() {
    const target = `${this.info.dst}/after/plugin/**/*.lua`;
    await this.sourceLua(target);
  }
  private async registerDenops() {
    const target = `${this.info.dst}/denops/*/main.ts`;
    for await (const file of expandGlob(target)) {
      const name = path.basename(path.dirname(file.path));
      await this.denops.call("denops#plugin#register", name, {
        mode: "skip",
      });
    }
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

  public async genHelptags() {
    const docDir = path.join(ensure(this.info.dst, is.String), "doc");
    if (!(await this.isHelptagsOld(docDir))) {
      return;
    }
    await execute(
      this.denops,
      `silent! helptags ${await fn.fnameescape(this.denops, docDir)}`,
    );
  }

  public async install(): Promise<Result<string[], string[]>> {
    const gitDir = path.join(ensure(this.info.dst, is.String), ".git");
    if (await exists(gitDir)) {
      return Result.success([]);
    }

    if (!(await this.isClone())) {
      return Result.success([]);
    }

    const output = await Git.clone(
      this.info.url,
      ensure(this.info.dst, is.String),
      this.info.branch,
    );
    if (output.success) {
      await this.genHelptags();
      this.info.isUpdate = true;
      return this.info.branch
        ? Result.success([`Git clone ${this.info.url} --branch=${this.info.branch}`])
        : Result.success([`Git clone ${this.info.url}`]);
    }
    return Result.failure([
      `Failed to clone ${this.info.url}`,
      `stdout:`,
      ...cmdOutToString(output.stdout),
      `stderr:`,
      ...cmdOutToString(output.stderr),
    ]);
  }

  public async update(): Promise<Result<string[], string[]>> {
    if (!(await this.isClone())) {
      return Result.success([]);
    }
    const git = new Git(ensure(this.info.dst, is.String));
    const beforeRev = await git.getRevision();
    await echo(this.denops, `Update ${this.info.dst}, branch: ${this.info.branch}`);
    const output = await git.pull(this.info.branch);
    const afterRev = await git.getRevision();
    await this.genHelptags();
    if (output.success) {
      if (beforeRev !== afterRev) {
        this.info.isUpdate = true;
        await this.build();
        const output = await git.getLog(
          beforeRev,
          afterRev,
          this.pluginOption.logarg,
        );
        if (output.success) {
          return Result.success([
            `--- ○: ${this.info.dst} --------------------`,
            ...cmdOutToString(output.stdout),
          ]);
        }
        return Result.success([
          `--- ×: ${this.info.dst} --------------------`,
          `Failed to git log ${this.info.dst}`,
          `stdout:`,
          ...cmdOutToString(output.stdout),
          `stderr:`,
          ...cmdOutToString(output.stderr),
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
  }
}
