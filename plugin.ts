import * as fn from "https://deno.land/x/denops_std@v5.0.0/function/mod.ts";
import * as op from "https://deno.land/x/denops_std@v5.0.0/option/mod.ts";
import * as path from "https://deno.land/std@0.191.0/path/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.0/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { execute } from "https://deno.land/x/denops_std@v5.0.0/helper/mod.ts";
import { exists } from "https://deno.land/std@0.191.0/fs/mod.ts";
import { expandGlob } from "https://deno.land/std@0.191.0/fs/expand_glob.ts";
import {
  ensureString,
  isBoolean,
} from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";
import { Git } from "./git.ts";

export type Plug = {
  url: string;
  dst?: string;
  branch?: string;
  enabled?:
    | boolean
    | ((
      { denops, info }: { denops: Denops; info: PlugInfo },
    ) => Promise<boolean>);
  before?: (
    { denops, info }: { denops: Denops; info: PlugInfo },
  ) => Promise<void>;
  after?: (
    { denops, info }: { denops: Denops; info: PlugInfo },
  ) => Promise<void>;
  build?: (
    { denops, info }: { denops: Denops; info: PlugInfo },
  ) => Promise<void>;
  dependencies?: Plug[];
};

export type PlugInfo = Plug & {
  isLoad: boolean;
  isUpdate: boolean;
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
      const url = new URL(p.plug.url);
      p.info.dst = path.join(pluginOption.base, url.hostname, url.pathname);
    } else {
      p.info.url = `https://github.com/${p.plug.url}`;
      p.info.dst = path.join(pluginOption.base, "github.com", p.plug.url);
    }

    if (p.plug.dst) {
      p.clog(`[create] ${p.info.dst} set dst to ${p.plug.dst}`);
      p.info.dst = ensureString(await fn.expand(denops, p.plug.dst));
    }

    return p;
  }

  // deno-lint-ignore no-explicit-any
  private clog(data: any) {
    if (this.pluginOption.debug) {
      console.log(data);
    }
  }

  public async add() {
    try {
      this.clog(`[add] ${this.info.url} start !`);
      if (this.plug.enabled != undefined) {
        if (isBoolean(this.plug.enabled)) {
          if (!this.plug.enabled) {
            this.clog(`[add] ${this.info.url} enabled is false. (boolean)`);
            return;
          }
        } else {
          if (
            !(await this.plug.enabled({ denops: this.denops, info: this.info }))
          ) {
            this.clog(`[add] ${this.info.url} enabled is false. (func)`);
            return;
          }
        }
      }
      await this.before();
      await this.register();
      if (this.info.isLoad && this.info.isUpdate) {
        await this.build();
      }
      await this.after();
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      this.clog(`[add] ${this.info.url} end !`);
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
      if (!rtp.includes(ensureString(this.info.dst))) {
        registered = true;
        await op.runtimepath.set(this.denops, `${rtp},${this.info.dst}`);
      }
    });
    await this.source();
    await this.registerDenops();
    if (registered) {
      if (this.pluginOption.profile) {
        this.info.elaps = performance.now() - starttime;
      }
      this.info.isLoad = true;
    }
    this.clog(`[register] ${this.info.url} end !`);
    return;
  }

  public async before() {
    if (this.plug.before) {
      this.clog(`[before] ${this.info.url} start !`);
      await this.plug.before({ denops: this.denops, info: this.info });
      this.clog(`[before] ${this.info.url} end !`);
    }
  }
  public async after() {
    if (this.plug.after) {
      this.clog(`[after] ${this.info.url} start !`);
      await this.plug.after({ denops: this.denops, info: this.info });
      this.clog(`[after] ${this.info.url} end !`);
    }
  }
  public async build() {
    if (this.plug.build) {
      this.clog(`[build] ${this.info.url} start !`);
      await this.plug.build({ denops: this.denops, info: this.info });
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

  public async genHelptags() {
    const docDir = path.join(ensureString(this.info.dst), "doc");
    await execute(
      this.denops,
      `silent! helptags ${await fn.fnameescape(this.denops, docDir)}`,
    );
  }

  public async install() {
    if (await exists(ensureString(this.info.dst))) {
      return;
    }

    const output = await Git.clone(
      this.info.url,
      ensureString(this.info.dst),
      this.plug.branch,
    );
    if (output.success) {
      await this.genHelptags();
      this.info.isUpdate = true;
    } else {
      console.error(
        `Failed to clone ${this.info.url}, stdout: [${
          new TextDecoder().decode(
            output.stdout,
          )
        }], stderr: [${new TextDecoder().decode(output.stderr)}]`,
      );
    }
    return this.plug.branch
      ? `Git clone ${this.info.url} --branch=${this.plug.branch}`
      : `Git clone ${this.info.url}`;
  }

  public async update() {
    const git = new Git(ensureString(this.info.dst));
    const beforeRev = await git.getRevision();
    const output = await git.pull(this.plug.branch);
    const afterRev = await git.getRevision();
    if (output.success) {
      if (beforeRev !== afterRev) {
        await this.genHelptags();
        this.info.isUpdate = true;
        await this.build();
        const output = await git.getLog(
          beforeRev,
          afterRev,
          this.pluginOption.logarg,
        );
        if (output.success) {
          return [
            `--- ${this.info.dst} --------------------`,
            ...new TextDecoder().decode(output.stdout).split("\n"),
          ];
        } else {
          console.error(
            `Failed to git log ${this.info.dst}, stdout: [${
              new TextDecoder().decode(
                output.stdout,
              )
            }], stderr: [${new TextDecoder().decode(output.stderr)}]`,
          );
        }
      }
    } else {
      console.error(
        `Failed to pull ${this.info.url}, stdout: [${
          new TextDecoder().decode(
            output.stdout,
          )
        }], stderr: [${new TextDecoder().decode(output.stderr)}]`,
      );
    }
    return null;
  }
}
