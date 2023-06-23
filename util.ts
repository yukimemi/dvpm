import type { Denops } from "https://deno.land/x/denops_std@v5.0.1/mod.ts";
import {
  echo,
  execute,
} from "https://deno.land/x/denops_std@v5.0.1/helper/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.0.1/function/mod.ts";

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
