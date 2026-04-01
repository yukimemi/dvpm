// =============================================================================
// File        : colorscheme_lazy_test.ts
// Author      : yukimemi
// Last Change : 2026/04/01 00:00:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { test } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

test({
  mode: "all",
  name: "Lazy Loading: colorscheme trigger defines ColorSchemePre autocmd",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    // Use Dvpm.begin to register dispatcher
    const dvpm = await Dvpm.begin(denops, { base, health: false });

    const colorName = "mycolor";
    const pluginUrl = "color/plugin";
    await dvpm.add({
      url: pluginUrl,
      lazy: {
        enabled: true,
        colorscheme: colorName,
      },
    });

    const plugin = dvpm.plugins[0];

    try {
      await dvpm.end();

      // Check if ColorSchemePre autocmd for mycolor is defined
      const isDefined = await denops.call("exists", `#ColorSchemePre#${colorName}`);
      assertEquals(isDefined, 1, `ColorSchemePre autocmd for ${colorName} should be defined`);

      // Manually trigger ColorSchemePre to simulate colorscheme command
      await denops.cmd(`doautocmd ColorSchemePre ${colorName}`);

      // Verify the plugin was loaded into runtimepath
      const rtp = await denops.eval("&runtimepath") as string;
      assertEquals(
        rtp.includes(plugin.info.dst),
        true,
        "Plugin destination should be in runtimepath after trigger",
      );
    } finally {
      // Clean up
      await denops.cmd(`autocmd! ColorSchemePre ${colorName}`);
      try {
        await Deno.remove(base, { recursive: true });
      } catch {
        // Ignore
      }
    }
  },
});
