import * as option from "https://deno.land/x/denops_std@v4.3.3/option/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v4.3.3/mod.ts";
import {
  basename,
  dirname,
  join,
} from "https://deno.land/std@0.188.0/path/mod.ts";
import { execute } from "https://deno.land/x/denops_std@v4.3.3/helper/mod.ts";
import { exists } from "https://deno.land/std@0.188.0/fs/mod.ts";
import { expandGlob } from "https://deno.land/std@0.188.0/fs/expand_glob.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import {
  ensureString,
  isBoolean,
} from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";
import {
  expand,
  fnameescape,
} from "https://deno.land/x/denops_std@v4.3.3/function/mod.ts";

export type Plug = {
  url: string;
  dst?: string;
  branch?: string;
  enabled?: boolean | ((denops: Denops) => Promise<boolean>);
  before?: (denops: Denops) => Promise<void>;
  after?: (denops: Denops) => Promise<void>;
  dependencies?: Plug[];
};

export type PluginOption = {
  base: string;
  debug?: boolean;
};

export class Plugin {
  static mutex = new Semaphore(1);
  static semaphore = new Semaphore(8);

  #dst: string;
  #url: string;

  constructor(
    public denops: Denops,
    public plug: Plug,
    public pluginOption: PluginOption,
  ) {
    this.#dst = "";
    this.#url = "";

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
      // Todo: not implemented.
      throw "Not implemented !";
    } else {
      p.#url = `https://github.com/${p.plug.url}`;
      p.#dst = join(pluginOption.base, "github.com", p.plug.url);
    }

    if (p.plug.dst) {
      p.clog(`[create] ${p.#url} set dst to ${p.plug.dst}`);
      p.#dst = ensureString(await expand(denops, p.plug.dst));
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
      await this.register();
      await this.after();
    } catch (e) {
      console.error(e);
    } finally {
      this.clog(`[add] ${this.#url} end !`);
    }
  }

  public async end() {
    await this.sourceAfter();
  }

  public async register() {
    this.clog(`[register] ${this.#url} start !`);
    await Plugin.mutex.lock(async () => {
      const rtp = await option.runtimepath.get(this.denops);
      if (rtp.indexOf(this.#dst) === -1) {
        await option.runtimepath.set(
          this.denops,
          `${rtp},${this.#dst}`,
        );
      }
    });
    await this.source();
    await this.registerDenops();
    this.clog(`[register] ${this.#url} end !`);
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
      await Plugin.semaphore.lock(async () => {
        this.clog(`[source] ${this.#url} start !`);
        await this.sourceVimPre();
        await this.sourceLuaPre();
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.clog(`[source] ${this.#url} end !`);
    }
  }
  public async sourceAfter() {
    try {
      await Plugin.semaphore.lock(async () => {
        this.clog(`[sourceAfter] ${this.#url} start !`);
        await this.sourceVimAfter();
        await this.sourceLuaAfter();
      });
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
    await Plugin.semaphore.lock(async () => {
      const target = `${this.#dst}/denops/*/main.ts`;
      for await (const file of expandGlob(target)) {
        const name = basename(dirname(file.path));
        await this.denops.call("denops#plugin#register", name, {
          mode: "skip",
        });
      }
    });
  }

  public async genHelptags() {
    await Plugin.semaphore.lock(async () => {
      const docDir = join(this.#dst, "doc");
      await execute(
        this.denops,
        `silent! helptags ${await fnameescape(this.denops, docDir)}`,
      );
    });
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
