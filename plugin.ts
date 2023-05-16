import * as option from "https://deno.land/x/denops_std@v4.3.1/option/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v4.3.1/mod.ts";
import { join } from "https://deno.land/std@0.187.0/path/mod.ts";
import { execute } from "https://deno.land/x/denops_std@v4.3.1/helper/mod.ts";
import { exists } from "https://deno.land/std@0.187.0/fs/mod.ts";
import { expandGlob } from "https://deno.land/std@0.187.0/fs/expand_glob.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import {
  ensureString,
  isBoolean,
} from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";
import {
  expand,
  fnamemodify,
} from "https://deno.land/x/denops_std@v4.3.1/function/mod.ts";

export type Plug = {
  url: string;
  dst?: string;
  branch?: string;
  enabled?: boolean | ((denops: Denops) => Promise<boolean>);
  before?: (denops: Denops) => Promise<void>;
  after?: (denops: Denops) => Promise<void>;
};

export type PluginOption = {
  base: string;
  debug?: boolean;
};

export class Plugin {
  static lock = new Semaphore(1);
  static semaphore: Semaphore;

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
  clog(data: any) {
    if (this.pluginOption.debug) {
      console.log(data);
    }
  }

  async add() {
    try {
      await Plugin.lock.lock(async () => {
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
        await this.register();
        this.clog(`[add] ${this.#url} end !`);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async register() {
    this.clog(`[register] ${this.#url} start !`);
    if (this.plug.before) {
      await this.plug.before(this.denops);
    }

    await option.runtimepath.set(
      this.denops,
      `${this.#dst},${(await option.runtimepath.get(this.denops))}`,
    );
    await this.sourceVimPre();
    await this.sourceVimPost();
    await this.sourceLuaPre();
    await this.sourceLuaPost();
    await this.registerDenops();

    if (this.plug.after) {
      this.clog(`[after] ${this.#url} start !`);
      await this.plug.after(this.denops);
      this.clog(`[after] ${this.#url} end !`);
    }
    this.clog(`[register] ${this.#url} end !`);
  }

  async sourceVim(target: string) {
    for await (const file of expandGlob(target)) {
      await execute(this.denops, `source ${file.path}`);
    }
  }
  async sourceVimPre() {
    const target = `${this.#dst}/plugin/**/*.vim`;
    await this.sourceVim(target);
  }
  async sourceVimPost() {
    const target = `${this.#dst}/after/plugin/**/*.vim`;
    await this.sourceVim(target);
  }
  async sourceLua(target: string) {
    for await (const file of expandGlob(target)) {
      await execute(this.denops, `luafile ${file.path}`);
    }
  }
  async sourceLuaPre() {
    const target = `${this.#dst}/plugin/**/*.lua`;
    await this.sourceLua(target);
  }
  async sourceLuaPost() {
    const target = `${this.#dst}/after/plugin/**/*.lua`;
    await this.sourceLua(target);
  }
  async registerDenops() {
    const target = `${this.#dst}/denops/*/main.ts`;
    for await (const file of expandGlob(target)) {
      const name = await fnamemodify(this.denops, file.path, ":h:t");
      if (await this.denops.call("denops#plugin#is_loaded", name)) {
        continue;
      }
      if (await this.denops.call("denops#server#status") === "running") {
        await this.denops.call("denops#plugin#register", name, {
          mode: "skip",
        });
      }
      await this.denops.call("denops#plugin#wait", name);
    }
  }

  async install() {
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
      if (!status.success) {
        throw `Failed to clone ${this.#url}`;
      }
    });
  }

  async update() {
    await Plugin.semaphore.lock(async () => {
      console.log(`Update: ${this.#url}`);
      const cmd = new Deno.Command("git", {
        args: ["-C", this.#dst, "pull", "--rebase"],
      });
      const status = await cmd.spawn().status;
      if (!status.success) {
        throw `Failed to update ${this.#url}`;
      }
    });
  }
}
