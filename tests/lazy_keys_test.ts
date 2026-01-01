// =============================================================================
// File        : lazy_keys_test.ts
// Author      : yukimemi
// Last Change : 2025/01/01 00:00:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { test } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

test({
  mode: "all",
  name: "add hook is executed at end() even for lazy plugins",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    await denops.cmd("let g:dvpm_test_add_hook = 0");
    await dvpm.add({
      url: "lazy/plugin",
      lazy: true,
      add: async ({ denops }) => {
        await denops.cmd("let g:dvpm_test_add_hook = 1");
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();

    await dvpm.end();

    const addHookFired = await denops.eval("g:dvpm_test_add_hook");
    assertEquals(addHookFired, 1, "add hook should be executed at end()");
    assertEquals(plugin.info.isLoad, false, "Plugin should still be NOT loaded");
  },
});

test({
  mode: "all",
  name: "keys with object (KeyMap) handles remapping correctly",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    const lhs = "gL";
    const rhs = ":let g:dvpm_test_keys_rhs = 1<CR>";
    await denops.cmd("let g:dvpm_test_keys_rhs = 0");

    await dvpm.add({
      url: "lazy/keys",
      keys: { lhs, rhs, mode: "n" },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    // Ensure dst exists for RTP
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Check if proxy mapping is created
    const mapResult = await denops.call("execute", `nmap ${lhs}`) as string;
    assertEquals(mapResult.includes("denops#request"), true, "Proxy mapping should be created");

    // Trigger loading by calling the mapping (via request)
    await dvpm.load(plugin.info.url, "keys", lhs);

    // After load, the mapping should be updated to RHS
    const postMapResult = await denops.call("execute", `nmap ${lhs}`) as string;
    assertEquals(postMapResult.includes("let g:dvpm_test_keys_rhs = 1"), true, "Mapping should be updated to RHS");
    
    // Check if RHS was executed via feedkeys (it should have been called in load())
    const rhsResult = await denops.eval("g:dvpm_test_keys_rhs");
    assertEquals(rhsResult, 1, "RHS should be executed via feedkeys in load()");
  },
});
