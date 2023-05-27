import * as fn from "https://deno.land/x/denops_std@v5.0.0/function/mod.ts";
import * as op from "https://deno.land/x/denops_std@v5.0.0/option/mod.ts";
import * as path from "https://deno.land/std@0.189.0/path/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.0/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { execute } from "https://deno.land/x/denops_std@v5.0.0/helper/mod.ts";
import { exists } from "https://deno.land/std@0.189.0/fs/mod.ts";
import { expandGlob } from "https://deno.land/std@0.189.0/fs/expand_glob.ts";
import {
  ensureString,
  isBoolean,
} from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";

export type Plug = {
  url: string;
  dst?: string;
  branch?: string;
  enabled?: boolean | ((denops: Denops) => Promise<boolean>);
  before?: (denops: Denops) => Promise<void>;
  after?: (denops: Denops) => Promise<void>;
  dependencies?: Plug[];
};

export type PlugState = Plug & {
  isLoad: boolean;
  elaps: number;
};

export type PluginOption = {
  base: string;
  debug?: boolean;
  profile?: boolean;
};

export class Plugin {
  static mutex = new Semaphore(1);
  static semaphore = new Semaphore(8);

  #dst: string;
  #url: string;

  public state: PlugState;

  constructor(
    public denops: Denops,
    public plug: Plug,
    public pluginOption: PluginOption,
  ) {
    this.#dst = "";
    this.#url = "";
    this.state = {
      ...plug,
      isLoad: false,
      elaps: 0,
    };

    if (this.pluginOption.debug == undefined) {
      this.pluginOption.debug = false;
    }
  }

  public static async create(
    denops: Denops,
    plug: Plug,
    pluginOption: PluginOption,
  ): Promise<Plugin> {
    const p = new Plugin(denops, plug, pluginOption);
    if (p.plug.url.startsWith("http") || p.plug.url.startsWith("git")) {
      p.#url = p.plug.url;
      const url = new URL(p.plug.url);
      p.#dst = path.join(pluginOption.base, url.hostname, url.pathname);
    } else {
      p.#url = `https://github.com/${p.plug.url}`;
      p.#dst = path.join(pluginOption.base, "github.com", p.plug.url);
    }

    if (p.plug.dst) {
      p.clog(`[create] ${p.#url} set dst to ${p.plug.dst}`);
      p.#dst = ensureString(await fn.expand(denops, p.plug.dst));
    }

    return p;
  }

  // deno-lint-ignore no-explicit-any
  private clog(data: any) {
    if (this.pluginOption.debug) {
      console.log(data);
    }
  }

  public async add(): Promise<boolean> {
    try {
      let added = false;
      await Plugin.semaphore.lock(async () => {
        this.clog(`[add] ${this.#url} start !`);
        if (this.plug.enabled != undefined) {
          if (isBoolean(this.plug.enabled)) {
            if (!this.plug.enabled) {
              this.clog(`[add] ${this.#url} enabled is false. (boolean)`);
              return;
            }
          } else {
            if (!(await this.plug.enabled(this.denops))) {
              this.clog(`[add] ${this.#url} enabled is false. (func)`);
              return;
            }
          }
        }
        await this.before();
        added = await this.register();
        await this.after();
      });
      return added;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      this.clog(`[add] ${this.#url} end !`);
    }
  }

  public async end() {
    await this.sourceAfter();
  }

  public async register(): Promise<boolean> {
    this.clog(`[register] ${this.#url} start !`);
    let registered = false;
    let starttime = 0;
    await Plugin.mutex.lock(async () => {
      if (this.pluginOption.profile) {
        starttime = performance.now();
      }
      const rtp = (await op.runtimepath.get(this.denops)).split(",");
      if (!rtp.includes(this.#dst)) {
        registered = true;
        await op.runtimepath.set(
          this.denops,
          `${rtp},${this.#dst}`,
        );
      }
    });
    await this.source();
    await this.registerDenops();
    if (registered) {
      if (this.pluginOption.profile) {
        this.state.elaps = performance.now() - starttime;
      }
      this.state.isLoad = true;
    }
    this.clog(`[register] ${this.#url} end !`);
    return registered;
  }

  public async before() {
    if (this.plug.before) {
      this.clog(`[before] ${this.#url} start !`);
      await this.plug.before(this.denops);
      this.clog(`[before] ${this.#url} end !`);
    }
  }
  public async after() {
    if (this.plug.after) {
      this.clog(`[after] ${this.#url} start !`);
      await this.plug.after(this.denops);
      this.clog(`[after] ${this.#url} end !`);
    }
  }

  public async source() {
    try {
      this.clog(`[source] ${this.#url} start !`);
      await this.sourceVimPre();
      await this.sourceLuaPre();
    } catch (e) {
      console.error(e);
    } finally {
      this.clog(`[source] ${this.#url} end !`);
    }
  }
  public async sourceAfter() {
    try {
      this.clog(`[sourceAfter] ${this.#url} start !`);
      await this.sourceVimAfter();
      await this.sourceLuaAfter();
    } catch (e) {
      console.error(e);
    } finally {
      this.clog(`[sourceAfter] ${this.#url} end !`);
    }
  }

  private async sourceVim(target: string) {
    for await (const file of expandGlob(target)) {
      await execute(this.denops, `source ${file.path}`);
    }
  }
  private async sourceVimPre() {
    const target = `${this.#dst}/plugin/**/*.vim`;
    await this.sourceVim(target);
  }
  private async sourceVimAfter() {
    const target = `${this.#dst}/after/plugin/**/*.vim`;
    await this.sourceVim(target);
  }
  private async sourceLua(target: string) {
    for await (const file of expandGlob(target)) {
      await execute(this.denops, `luafile ${file.path}`);
    }
  }
  private async sourceLuaPre() {
    const target = `${this.#dst}/plugin/**/*.lua`;
    await this.sourceLua(target);
  }
  private async sourceLuaAfter() {
    const target = `${this.#dst}/after/plugin/**/*.lua`;
    await this.sourceLua(target);
  }
  private async registerDenops() {
    const target = `${this.#dst}/denops/*/main.ts`;
    for await (const file of expandGlob(target)) {
      const name = path.basename(path.dirname(file.path));
      await this.denops.call("denops#plugin#register", name, {
        mode: "skip",
      });
    }
  }

  public async genHelptags() {
    const docDir = path.join(this.#dst, "doc");
    await execute(
      this.denops,
      `silent! helptags ${await fn.fnameescape(this.denops, docDir)}`,
    );
  }

  public async install() {
    await Plugin.semaphore.lock(async () => {
      if (await exists(this.#dst)) {
        return;
      }

      let cloneOpt: string[] = [];
      if (this.plug.branch) {
        cloneOpt = cloneOpt.concat(["--branch", this.plug.branch]);
      }
      const cmd = new Deno.Command("git", {
        args: ["clone", ...cloneOpt, this.#url, this.#dst],
      });
      const status = await cmd.spawn().status;
      if (status.success) {
        await this.genHelptags();
      } else {
        throw `Failed to clone ${this.#url}`;
      }
    });
  }

  public async update() {
    await Plugin.semaphore.lock(async () => {
      console.log(`Update: ${this.#url}`);
      const cmd = new Deno.Command("git", {
        args: ["-C", this.#dst, "pull", "--rebase"],
      });
      const status = await cmd.spawn().status;
      if (status.success) {
        await this.genHelptags();
      } else {
        throw `Failed to update ${this.#url}`;
      }
    });
  }
}
