import { Denops } from "https://deno.land/x/denops_std@v4.3.0/mod.ts";
import { Semaphore } from "https://deno.land/x/async@v2.0.2/semaphore.ts";
import { type Plug, Plugin } from "./plugin.ts";

export class Dvpm {
  #plugins: Plugin[] = [];
  #sem: Semaphore;

  constructor(
    public denops: Denops,
    public base: string,
    public debug = false,
  ) {
    this.#sem = new Semaphore(1);
  }

  public async install(plug?: Plug) {}

  public async update(plug?: Plug) {}

  public async uninstall(plug?: Plug) {}

  public async add(plug: Plug) {
    const p = await Plugin.create(this.denops, this.base, plug, this.debug);
    await p.install(this.#sem);
    await p.add(this.#sem);
    this.#plugins.push(p);
  }
}
