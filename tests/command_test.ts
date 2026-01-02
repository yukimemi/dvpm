// =============================================================================
// File        : command_test.ts
// Author      : yukimemi
// Last Change : 2026/01/02 12:00:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { test } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

test({
  mode: "all",
  name: "Dvpm handles cmd option with string",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    await dvpm.add({
      url: "https://example.com/plugin1",
      cmd: "TestCmd1",
    });

    // Mocking install/update/build to avoid network/git operations
    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();

    await dvpm.end();

    // Verify command existence by checking if we can get its definition
    // Note: detailed check might be hard, but at least it shouldn't fail
    const exists = await denops.call("exists", ":TestCmd1");
    assertEquals(exists, 2);
  },
});

test({
  mode: "all",
  name: "Dvpm handles cmd option with Command object (default complete)",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    await dvpm.add({
      url: "https://example.com/plugin2",
      cmd: { name: "TestCmd2" },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();

    await dvpm.end();

    const exists = await denops.call("exists", ":TestCmd2");
    assertEquals(exists, 2);
  },
});

test({
  mode: "all",
  name: "Dvpm handles cmd option with Command object (custom complete)",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    await dvpm.add({
      url: "https://example.com/plugin3",
      cmd: { name: "TestCmd3", complete: "custom,ListFunc" },
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();

    await dvpm.end();

    const exists = await denops.call("exists", ":TestCmd3");
    assertEquals(exists, 2);

    // Check completion attribute via verbose command or similar if possible,
    // but for now existence check is enough to verify type handling logic.
  },
});

test({
  mode: "all",
  name: "Dvpm handles mixed cmd types",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    await dvpm.add({
      url: "https://example.com/plugin4",
      cmd: ["TestCmd4", { name: "TestCmd5", complete: "dir" }],
    });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();

    await dvpm.end();

    assertEquals(await denops.call("exists", ":TestCmd4"), 2);
    assertEquals(await denops.call("exists", ":TestCmd5"), 2);
  },
});
