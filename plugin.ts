import * as option from "https://deno.land/x/denops_std@v4.3.0/option/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v4.3.0/mod.ts";
import { join } from "https://deno.land/std@0.187.0/path/mod.ts";
import { execute } from "https://deno.land/x/denops_std@v4.3.0/helper/mod.ts";
import { exists } from "https://deno.land/std@0.187.0/fs/mod.ts";
import { expandGlob } from "https://deno.land/std@0.187.0/fs/expand_glob.ts";

export type Plug = {
  url: string;
  branch?: string;
  enabled?: boolean;
  before?: (denops: Denops) => Promise<void>;
  after?: (denops: Denops) => Promise<void>;
};

export class Plugin {
  #dst: string;
  #url: string;

  constructor(
    public denops: Denops,
    public base: string,
    public plug: Plug,
  ) {
    if (plug.url.startsWith("http") || plug.url.startsWith("git")) {
      this.#url = plug.url;
      // Todo: not implemented.
      throw "Not implemented !";
    } else {
      this.#url = `https://github.com/${plug.url}`;
      this.#dst = join(base, "github.com", plug.url);
    }
  }

  async add() {
    if (!(await exists(this.#dst))) {
      await this.install();
    }
    await this.register();
  }

  async register() {
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

    if (this.plug.after) {
      await this.plug.after(this.denops);
    }
  }

  async sourceVim(target: string) {
    for await (const file of expandGlob(target)) {
      execute(this.denops, `source ${file.path}`);
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
      execute(this.denops, `luafile ${file.path}`);
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

  async install(): Promise<boolean> {
    if (await exists(this.#dst)) {
      return true;
    }

    let cloneOpt: string[] = [];
    if (this.plug.branch) {
      cloneOpt = cloneOpt.concat(["--branch", this.plug.branch]);
    }
    const cmd = new Deno.Command("git", {
      args: ["clone", ...cloneOpt, this.#url, this.#dst],
    });
    const status = await cmd.spawn().status;
    return status.success;
  }

  async update() {}
}
