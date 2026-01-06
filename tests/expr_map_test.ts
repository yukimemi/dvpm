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
    await denops.call(`Dvpm_Internal_Load_${name}`, plugin.info.url, lhs);

    // After load: check if rhs is set
    const info = await mapping.read(denops, lhs, { mode: "o" });
    assertEquals(info.rhs, rhs);
  },
});
