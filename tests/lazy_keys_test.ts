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
    const dvpm = new Dvpm(denops, { base, health: false });

    await denops.cmd("let g:dvpm_test_add_hook = 0");
    await dvpm.add({
      url: "lazy/plugin",
      lazy: {
        enabled: true,
      },
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
    assertEquals(plugin.info.isLoaded, false, "Plugin should still be NOT loaded");
  },
});

test({
  mode: "all",
  name: "keys with object (KeyMap) handles remapping correctly",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    const lhs = "gL";
    const rhs = ":let g:dvpm_test_keys_rhs = 1<CR>";
    await denops.cmd("let g:dvpm_test_keys_rhs = 0");

    await dvpm.add({
      url: "lazy/keys",
      lazy: {
        keys: { lhs, rhs, mode: "n" },
      },
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
    assertEquals(mapResult.includes("denops#notify"), true, "Proxy mapping should be created");

    // Trigger loading by calling the mapping (via request)
    await dvpm.load(plugin.info.url, "keys", lhs);

    // After load: check RHS using maparg
    // deno-lint-ignore no-explicit-any
    const info = (await denops.call("maparg", lhs, "n", 0, 1)) as any;
    assertEquals(
      info.rhs,
      rhs,
      "Mapping should be updated to RHS",
    );
  },
});

test({
  mode: "all",
  name: "keys with object (KeyMap) handles multiple modes and remapping correctly",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    const lhs = "gX";
    const rhs = ":let g:dvpm_test_keys_multi = 1<CR>";

    await dvpm.add({
      url: "lazy/keys_multi",
      lazy: {
        keys: { lhs, rhs, mode: ["n", "v"] },
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Before load: check proxy
    for (const mode of ["n", "v"]) {
      // deno-lint-ignore no-explicit-any
      const info = (await denops.call("maparg", lhs, mode, 0, 1)) as any;
      assertEquals(
        info.rhs.includes("denops#notify"),
        true,
        `Proxy mapping should exist in ${mode} mode`,
      );
    }

    // Trigger loading
    await dvpm.load(plugin.info.url, "keys", lhs);

    // After load: check RHS
    for (const mode of ["n", "v"]) {
      // deno-lint-ignore no-explicit-any
      const info = (await denops.call("maparg", lhs, mode, 0, 1)) as any;
      assertEquals(info.rhs, rhs, `Mapping should be updated to RHS in ${mode} mode`);
    }
  },
});

test({
  mode: "all",
  name: "keys with <space> handles remapping correctly",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    const lhs = "<space>b";
    const rhs = ":let g:dvpm_test_keys_space = 1<CR>";
    await denops.cmd("let g:dvpm_test_keys_space = 0");

    await dvpm.add({
      url: "lazy/keys_space",
      lazy: {
        keys: { lhs, rhs, mode: "n" },
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Trigger loading
    await dvpm.load(plugin.info.url, "keys", lhs);

    // After load: check RHS using maparg
    // deno-lint-ignore no-explicit-any
    const info = (await denops.call("maparg", lhs, "n", 0, 1)) as any;
    assertEquals(
      info.rhs,
      rhs,
      "Mapping should be updated to RHS for <space>b",
    );

    // After re-mapping, the RHS should be executed (via feedkeys in load())
    // Wait a bit for feedkeys to be processed
    await new Promise((resolve) => setTimeout(resolve, 200));
    const rhsResult = await denops.eval("g:dvpm_test_keys_space");
    assertEquals(rhsResult, 1, "RHS <cmd>...<cr> should be executed after load()");

    // Verify buffer content: should NOT contain garbage like "ce>b>"
    const lines = (await denops.call("getbufline", "%", 1, "$")) as string[];
    const garbageFound = lines.some((l) => l.includes("ce>b") || l.includes('>"'));
    assertEquals(
      garbageFound,
      false,
      `Buffer contains garbage: ${JSON.stringify(lines)}`,
    );
  },
});

test({
  mode: "all",
  name: "keys with <cmd>...<cr> RHS executes correctly on first press",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    const lhs = "gC";
    const rhs = "<cmd>let g:dvpm_test_keys_cmd = 1<cr>";
    await denops.cmd("let g:dvpm_test_keys_cmd = 0");

    await dvpm.add({
      url: "lazy/keys_cmd",
      lazy: {
        keys: { lhs, rhs, mode: "n" },
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Trigger load
    await dvpm.load(plugin.info.url, "keys", lhs);

    // Wait for feedkeys
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = await denops.eval("g:dvpm_test_keys_cmd");
    assertEquals(result, 1, "RHS <cmd>...<cr> should be executed immediately");
  },
});

test({
  mode: "all",
  name: "keys with desc property handles correctly",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    const lhs = "gD";
    const rhs = ":let g:dvpm_test_keys_desc = 1<CR>";
    const desc = "Test description";

    await dvpm.add({
      url: "lazy/keys_desc",
      lazy: {
        keys: { lhs, rhs, mode: "n", desc },
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    if (await denops.call("has", "nvim")) {
      // deno-lint-ignore no-explicit-any
      const maps = (await denops.call("nvim_get_keymap", "n")) as any[];
      const info = maps.find((m) => m.lhs === lhs);
      assertEquals(info?.desc, desc, "Proxy mapping should have description in Neovim");
    } else {
      // Vim: check mapping exists but desc does not
      // deno-lint-ignore no-explicit-any
      const info = (await denops.call("maparg", lhs, "n", 0, 1)) as any;
      assertEquals(!!info, true, "Proxy mapping should be created in Vim");
      assertEquals(info.desc, undefined, "Mapping should NOT have description in Vim");
    }

    // Trigger loading
    await dvpm.load(plugin.info.url, "keys", lhs);

    if (await denops.call("has", "nvim")) {
      // After load: check RHS and desc
      // deno-lint-ignore no-explicit-any
      const info = (await denops.call("maparg", lhs, "n", 0, 1)) as any;
      assertEquals(info.rhs, rhs, "Mapping should be updated to RHS");
      assertEquals(info.desc, desc, "Updated mapping should still have description in Neovim");
    } else {
      // After load: check RHS in Vim
      // deno-lint-ignore no-explicit-any
      const info = (await denops.call("maparg", lhs, "n", 0, 1)) as any;
      assertEquals(info.rhs, rhs, "Mapping should be updated to RHS in Vim");
      assertEquals(info.desc, undefined, "Updated mapping should NOT have description in Vim");
    }
  },
});

test({
  mode: "all",
  name: "keys with string (plugin defined) handles correctly",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    const lhs = "gP";
    const pluginRhs = ":let g:dvpm_test_keys_plugin = 1<CR>";

    await dvpm.add({
      url: "lazy/keys_plugin_defined",
      lazy: {
        keys: lhs,
      },
      before: async ({ denops }) => {
        // Simulate plugin defining the mapping
        await denops.cmd(`nnoremap ${lhs} ${pluginRhs}`);
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Check proxy mapping
    const mapResult = await denops.call("execute", `nmap ${lhs}`) as string;
    assertEquals(mapResult.includes("denops#notify"), true, "Proxy mapping should be created");

    // Trigger loading
    await dvpm.load(plugin.info.url, "keys", lhs);

    // After load: check RHS using maparg
    // deno-lint-ignore no-explicit-any
    const info = (await denops.call("maparg", lhs, "n", 0, 1)) as any;
    assertEquals(
      info.rhs,
      pluginRhs,
      "Mapping should be preserved as plugin defined",
    );
  },
});

test({
  mode: "all",
  name: "keys with object (KeyMap) without rhs handles unmap correctly",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    const lhs = "gU";
    const pluginRhs = ":let g:dvpm_test_keys_unmap = 1<CR>";

    await dvpm.add({
      url: "lazy/keys_unmap",
      lazy: {
        // rhs is undefined
        keys: { lhs, mode: ["n", "v"] },
      },
      before: async ({ denops }) => {
        // Simulate plugin defining the mapping
        await denops.cmd(`nnoremap ${lhs} ${pluginRhs}`);
        await denops.cmd(`vnoremap ${lhs} ${pluginRhs}`);
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Check proxy mapping for 'n' and 'v'
    for (const mode of ["n", "v"]) {
      const mapResult = await denops.call("execute", `${mode}map ${lhs}`) as string;
      assertEquals(
        mapResult.includes("denops#notify"),
        true,
        `Proxy mapping should be created for ${mode}`,
      );
    }

    // Trigger loading
    await dvpm.load(plugin.info.url, "keys", lhs);

    // After load: check RHS using maparg
    for (const mode of ["n", "v"]) {
      // deno-lint-ignore no-explicit-any
      const info = (await denops.call("maparg", lhs, mode, 0, 1)) as any;
      assertEquals(
        info.rhs,
        pluginRhs,
        `Mapping should be preserved as plugin defined for ${mode} (proxy unmapped)`,
      );
    }
  },
});
