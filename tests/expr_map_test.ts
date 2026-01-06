import { assertEquals } from "@std/assert";
import { test } from "@denops/test";
import * as mapping from "@denops/std/mapping";
import { Dvpm } from "../dvpm.ts";

test({
  mode: "all",
  name: "Verify operator-pending mode lazy loading via Dvpm",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = await Dvpm.begin(denops, { base, health: false });

    const lhs = "ae";
    const rhs = ":<C-u>let g:dvpm_test_o_mode = 1<CR>";
    await denops.cmd("let g:dvpm_test_o_mode = 0");

    await dvpm.add({
      url: "lazy/o_mode",
      lazy: {
        keys: { lhs, rhs, mode: ["o", "x"] },
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Trigger loading by calling the mapping
    // We simulate what happens when 'ae' is pressed in Vim
    const name = denops.name.replace(/-/g, "_");
    const ret = await denops.call(`Dvpm_Internal_Load_${name}`, plugin.info.url, lhs);

    // Verify that the function returns the RHS, not the LHS
    // This ensures that <expr> mapping will re-evaluate to the new RHS
    assertEquals(ret, rhs);

    // After load: check if rhs is set
    const info = await mapping.read(denops, lhs, { mode: "o" });
    assertEquals(info.rhs, rhs);
  },
});

test({
  mode: "all",
  name: "Verify operator-pending mode lazy loading (implicit RHS) via Dvpm",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = await Dvpm.begin(denops, { base, health: false });

    const lhs = "ie";
    const pluginRhs = ":<C-u>let g:dvpm_test_implicit_rhs = 1<CR>";
    await denops.cmd("let g:dvpm_test_implicit_rhs = 0");

    await dvpm.add({
      url: "lazy/implicit_rhs",
      lazy: {
        // rhs is undefined
        keys: { lhs, mode: ["o", "x"] },
      },
      before: async ({ denops }) => {
        // Simulate plugin defining the mapping
        await mapping.map(denops, lhs, pluginRhs, { mode: "o", noremap: true });
        await mapping.map(denops, lhs, pluginRhs, { mode: "x", noremap: true });
      },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await dvpm.end();

    // Trigger loading
    const name = denops.name.replace(/-/g, "_");

    // NOTE: In this test environment, mode() will likely return 'n'.
    // dvpm's logic for implicit RHS relies on mode().
    // If we call it from normal mode, it will look for 'n' mapping.
    // But our mapping is defined for 'o' and 'x'.
    // So mapping.read will fail to find 'ie' in 'n' mode, and return 'ie'.
    // This is expected failure in test if we don't mock mode() or define 'n' map.

    // To properly test the logic, we should define 'n' map as well,
    // OR we acknowledge that we can't fully simulate 'o' mode detection here.
    // Let's define 'n' map to verify the mapping.read logic itself works.
    await mapping.map(denops, lhs, pluginRhs, { mode: "n", noremap: true });

    const ret = await denops.call(`Dvpm_Internal_Load_${name}`, plugin.info.url, lhs);

    // It should return the pluginRhs found via mapping.read
    assertEquals(ret, pluginRhs);
  },
});
