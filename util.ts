// =============================================================================
// File        : util.ts
// Author      : yukimemi
// Last Change : 2024/07/27 21:50:28.
// =============================================================================

import type { Denops } from "jsr:@denops/std@7.1.1";
import { echo, echoerr, execute } from "jsr:@denops/std@7.1.1/helper";
import * as fs from "jsr:@std/fs@1.0.1";
import * as fn from "jsr:@denops/std@7.1.1/function";
import { dirname, extname } from "jsr:@std/path@1.0.2";
import { ensure, is } from "jsr:@core/unknownutil@4.3.0";

/**
 * vim.notify function
 */
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

/**
 * Cache the script
 */
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

/**
 * Determine whether it is typescript, lua or vim and return the string to read
 */
export async function getExecuteStr(denops: Denops, path: string): Promise<string> {
  const p = ensure(await fn.expand(denops, path), is.String);
  const extension = extname(p);
  if (extension === ".lua") {
    return `luafile ${p}`;
  } else if (extension === ".vim") {
    return `source ${p}`;
  }

  await echoerr(denops, `unknown extension: ${extension}`);
  return "";
}

/**
 * execute `lua` or `vim` file
 */
export async function executeFile(denops: Denops, path: string): Promise<void> {
  const executeStr = await getExecuteStr(denops, path);
  await execute(denops, executeStr);
}

/**
 * Convert command output to string
 */
export function cmdOutToString(cmdout: Uint8Array): string[] {
  return new TextDecoder().decode(cmdout).split("\n").map((l) => l.trim());
}
