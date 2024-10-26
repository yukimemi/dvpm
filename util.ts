// =============================================================================
// File        : util.ts
// Author      : yukimemi
// Last Change : 2024/10/26 13:33:03.
// =============================================================================

import * as fn from "jsr:@denops/std@7.3.0/function";
import * as fs from "jsr:@std/fs@1.0.5";
import type { Denops } from "jsr:@denops/std@7.3.0";
import { dirname, extname } from "jsr:@std/path@1.0.7";
import { echo, echoerr, execute } from "jsr:@denops/std@7.3.0/helper";
import { logger } from "./logger.ts";
import { z } from "npm:zod@3.23.8";

/**
 * vim.notify function
 */
export async function notify(denops: Denops, msg: string) {
  try {
    if (await fn.has(denops, "nvim")) {
      logger().debug(msg);
      await execute(
        denops,
        `lua vim.notify([[${msg}]], vim.log.levels.INFO)`,
      );
    } else {
      await echo(denops, msg);
    }
  } catch (e) {
    if (e instanceof Error) {
      logger().error(e.message);
    }
  }
}

/**
 * Cache the script
 */
export async function cache(
  denops: Denops,
  arg: { script: string; path: string },
) {
  const p = z.string().parse(await fn.expand(denops, arg.path));
  const s = arg.script.trim();
  await fs.ensureDir(dirname(p));
  if (await fs.exists(p)) {
    const content = (await Deno.readTextFile(p)).trim();
    if (s !== content) {
      logger().debug(`Save to ${p}`);
      await Deno.writeTextFile(p, s);
    }
  } else {
    logger().debug(`Save to ${p}`);
    await Deno.writeTextFile(p, s);
  }
}

/**
 * Determine whether it is typescript, lua or vim and return the string to read
 */
export async function getExecuteStr(denops: Denops, path: string): Promise<string> {
  const p = z.string().parse(await fn.expand(denops, path));
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

/**
 * Convert url
 */
export function convertUrl(url: string): string {
  if (url.startsWith("https://") || url.startsWith("git")) {
    return url;
  }
  return `https://github.com/${url}`;
}
