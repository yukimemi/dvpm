// =============================================================================
// File        : util.ts
// Author      : yukimemi
// Last Change : 2025/01/26 16:43:06.
// =============================================================================

import * as fn from "jsr:@denops/std@7.5.0/function";
import * as fs from "jsr:@std/fs@1.0.18";
import type { Denops } from "jsr:@denops/std@7.5.0";
import { dirname, extname } from "jsr:@std/path@1.1.0";
import { echo, execute } from "jsr:@denops/std@7.5.0/helper";
import { logger } from "./logger.ts";
import { z } from "npm:zod@3.25.42";

/**
 * vim.notify function
 */
export async function notify(denops: Denops, msg: string): Promise<void> {
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
      logger().error(`[notify] ${e.message}, ${e.stack}`);
    }
  }
}

/**
 * Cache the script
 */
export async function cache(
  denops: Denops,
  arg: { script: string; path: string },
): Promise<boolean> {
  const p = z.string().parse(await fn.expand(denops, arg.path));
  const s = arg.script.trim();
  await fs.ensureDir(dirname(p));
  if (await fs.exists(p)) {
    const content = (await Deno.readTextFile(p)).trim();
    if (s !== content) {
      logger().debug(`Save to ${p}`);
      await Deno.writeTextFile(p, s);
      return true;
    }
    return false;
  }
  logger().debug(`Save to ${p}`);
  await Deno.writeTextFile(p, s);
  return true;
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

  console.error(`unknown extension: ${extension}`);
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
  const hasProtocol = /^(https?:\/\/|git:\/\/|ssh:\/\/|git@)/.test(url);
  if (hasProtocol) {
    return url;
  } else {
    return `https://github.com/${url}`;
  }
}

/**
 * Parse url
 */
export function parseUrl(url: string): { hostname: string; pathname: string } {
  if (url.startsWith("git@")) {
    url = url.replace(":", "/").replace("git@", "https://");
  }
  if (url.endsWith(".git")) {
    url = url.slice(0, -4);
  }
  const urlObj = new URL(url);
  return {
    hostname: urlObj.hostname,
    pathname: urlObj.pathname,
  };
}
