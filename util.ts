import type { Denops } from "https://deno.land/x/denops_std@v5.0.1/mod.ts";
import { echo, execute } from "https://deno.land/x/denops_std@v5.0.1/helper/mod.ts";
import * as fs from "https://deno.land/std@0.192.0/fs/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.0.1/function/mod.ts";
import { dirname } from "https://deno.land/std@0.192.0/path/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.2.0/mod.ts";

export async function notify(denops: Denops, msg: string) {
  if (await fn.has(denops, "nvim")) {
    await execute(
      denops,
      `lua vim.notify([[${msg}]], vim.log.levels.INFO)`,
    );
  } else {
    await echo(denops, msg);
  }
}

export async function cache(
  denops: Denops,
  arg: { script: string; path: string },
) {
  const p = ensure(await fn.expand(denops, arg.path), is.String);
  const s = arg.script.trim();
  await fs.ensureDir(dirname(p));
  if (await fs.exists(p)) {
    const content = (await Deno.readTextFile(p)).trim();
    if (s !== content) {
      await Deno.writeTextFile(p, s);
    }
  } else {
    await Deno.writeTextFile(p, s);
  }
}
