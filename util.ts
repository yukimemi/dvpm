// =============================================================================
// File        : util.ts
// Author      : yukimemi
// Last Change : 2025/12/21 15:36:21.
// =============================================================================

import * as fn from "@denops/std/function";
import * as fs from "@std/fs";
import type { Denops } from "@denops/std";
import { dirname, extname } from "@std/path";
import { echo, execute } from "@denops/std/helper";
import { logger } from "./logger.ts";
import { type } from "arktype";

/**
 * Displays a notification message using `vim.notify` (Neovim) or `echo` (Vim).
 *
 * @param denops - Denops instance.
 * @param msg - Message to notify.
 */
export async function notify(denops: Denops, msg: string): Promise<void> {
  try {
    if (await fn.has(denops, "nvim")) {
      logger().debug(msg);
      await execute(
        denops,
        `lua vim.notify([[${msg.replace(/\]\]/g, "]] .. ']]' .. [[")}]], vim.log.levels.INFO)`,
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
 * Caches the given script to a file.
 *
 * @param denops - Denops instance.
 * @param arg - Script content and destination path.
 * @returns True if the cache file was created or updated, false if it already exists with the same content.
 */
export async function cache(
  denops: Denops,
  arg: { script: string; path: string },
): Promise<boolean> {
  const p = type("string").assert(await fn.expand(denops, arg.path));
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
 * Determines the Vim command to execute a file based on its extension (.lua or .vim).
 *
 * @param denops - Denops instance.
 * @param path - File path.
 * @returns A string containing the Vim command (e.g., "luafile ..." or "source ...").
 */
export async function getExecuteStr(denops: Denops, path: string): Promise<string> {
  const p = type("string").assert(await fn.expand(denops, path));
  const extension = extname(p);
  if (extension === ".lua") {
    return `luafile ${p}`;
  } else if (extension === ".vim") {
    return `source ${p}`;
  }

  logger().error(`unknown extension: ${extension}`);
  return "";
}

/**
 * Executes a Vim or Lua file.
 *
 * @param denops - Denops instance.
 * @param path - File path.
 */
export async function executeFile(denops: Denops, path: string): Promise<void> {
  const executeStr = await getExecuteStr(denops, path);
  await execute(denops, executeStr);
}

/**
 * Converts command output (Uint8Array) to an array of strings, split by line.
 *
 * @param cmdout - Command output buffer.
 * @returns Array of strings.
 */
export function cmdOutToString(cmdout: Uint8Array | undefined): string[] {
  return new TextDecoder().decode(cmdout).split("\n").map((l) => l.trim());
}

/**
 * Converts a repository shorthand or URL to a full HTTPS URL.
 *
 * @param url - Repository shorthand (e.g., "owner/repo") or full URL.
 * @returns Full HTTPS URL.
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
 * Parses a repository URL into its hostname and pathname components.
 *
 * @param url - Repository URL.
 * @returns Object containing hostname and pathname.
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
