import * as option from "https://deno.land/x/denops_std@v4.3.0/option/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v4.3.0/mod.ts";
import { join } from "https://deno.land/std@0.187.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.187.0/fs/mod.ts";

export type Plug = {
  url: string;
  branch?: string;
  enabled?: boolean;
  before?: (denops: Denops) => void;
  after?: (denops: Denops) => void;
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
      this.#dst = join(base, plug.url);
    }
  }

  async add() {
    if (!(await exists(this.#dst))) {
      this.install();
    }
    await this.register();
  }

  async register() {
    if (this.plug.before) {
      this.plug.before(this.denops);
    }

    option.runtimepath.set(
      this.denops,
      `${(await option.runtimepath.get(this.denops))},${this.#dst}`,
    );

    if (this.plug.after) {
      this.plug.after(this.denops);
    }
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
