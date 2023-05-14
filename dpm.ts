import { Denops } from "https://deno.land/x/denops_std@v4.3.0/mod.ts";
import { type Plug, Plugin } from "./plugin.ts";

export class Dpm {
  #plugins: Plugin[] = [];

  constructor(
    public denops: Denops,
    public base: string,
  ) {}

  public async install(plug?: Plug) {}

  public async update(plug?: Plug) {}

  public async uninstall(plug?: Plug) {}

  public async add(plug: Plug) {
    const p = new Plugin(this.denops, this.base, plug);
    await p.add();
    this.#plugins.push(p);
  }
}
