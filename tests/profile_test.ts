// =============================================================================
// File        : tests/profile_test.ts
// Author      : yukimemi
// Last Change : 2026/04/07 00:00:00.
// =============================================================================

import { assertEquals, assertExists } from "@std/assert";
import { test } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

function mockPlugin(dvpm: Dvpm) {
  for (const p of dvpm.plugins) {
    p.install = () => Promise.resolve([]);
    p.update = () => Promise.resolve([]);
    p.build = () => Promise.resolve();
  }
}

test({
  mode: "all",
  name: "profile: false (default) collects no profile data",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    mockPlugin(dvpm);
    await dvpm.end();

    const plugin = dvpm.plugins[0];
    assertEquals(
      plugin.info.profile,
      undefined,
      "profile data should not be collected when profile option is false",
    );
  },
});

test({
  mode: "all",
  name: "profile: true collects profile data for loaded plugins",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false, profile: true });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    mockPlugin(dvpm);
    await dvpm.end();

    const plugin = dvpm.plugins[0];
    assertExists(plugin.info.profile, "profile data should be collected when profile option is true");

    const prof = plugin.info.profile!;
    assertEquals(typeof prof.add, "number", "add should be a number");
    assertEquals(typeof prof.before, "number", "before should be a number");
    assertEquals(typeof prof.source, "number", "source should be a number");
    assertEquals(typeof prof.after, "number", "after should be a number");
    assertEquals(typeof prof.total, "number", "total should be a number");
    assertEquals(prof.total >= 0, true, "total should be non-negative");
    assertEquals(
      prof.total >= prof.add,
      true,
      "total should be at least as large as add",
    );
  },
});

test({
  mode: "all",
  name: "bufWriteProfile writes dvpm://profile buffer",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false, profile: true });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    mockPlugin(dvpm);
    await dvpm.end();

    await dvpm.bufWriteProfile();

    const bufnr = await denops.call("bufnr", "dvpm://profile") as number;
    assertEquals(bufnr !== -1, true, "dvpm://profile buffer should exist");

    const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];
    const hasTitle = lines.some((l) => l.includes("DVPM Plugin Performance Profile"));
    assertEquals(hasTitle, true, "buffer should contain title");

    const hasHeader = lines.some((l) => l.includes("total") && l.includes("add") && l.includes("load"));
    assertEquals(hasHeader, true, "buffer should contain column headers");
  },
});

test({
  mode: "all",
  name: "bufWriteProfile separates loaded and lazy-unloaded plugins",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false, profile: true });

    // Eager plugin
    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    // Lazy plugin (cmd trigger — never actually triggered in this test)
    await dvpm.add({
      url: "https://github.com/yukimemi/autocursor.vim",
      lazy: { cmd: "AutoCursor" },
    });

    mockPlugin(dvpm);
    await dvpm.end();

    await dvpm.bufWriteProfile();

    const bufnr = await denops.call("bufnr", "dvpm://profile") as number;
    const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];

    const hasNotLoadedSection = lines.some((l) =>
      l.includes("not yet loaded") || l.includes("not loaded")
    );
    assertEquals(
      hasNotLoadedSection,
      true,
      "buffer should have a section for lazy plugins not yet loaded",
    );

    // Loaded: count should be 1
    const summaryLine = lines.find((l) => l.includes("Loaded:"));
    assertExists(summaryLine, "summary line with Loaded count should exist");
    assertEquals(summaryLine?.includes("Loaded: 1"), true, "should report 1 loaded plugin");
    assertEquals(
      summaryLine?.includes("Lazy (not loaded): 1"),
      true,
      "should report 1 lazy unloaded plugin",
    );
  },
});

test({
  mode: "all",
  name: "bufWriteProfile is safe to call multiple times",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false, profile: true });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    mockPlugin(dvpm);
    await dvpm.end();

    await dvpm.bufWriteProfile();
    await dvpm.bufWriteProfile();
    await dvpm.bufWriteProfile();

    const bufnr = await denops.call("bufnr", "dvpm://profile") as number;
    assertEquals(bufnr !== -1, true, "buffer should still exist after multiple calls");

    const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];
    const titleLines = lines.filter((l) => l.includes("DVPM Plugin Performance Profile"));
    assertEquals(titleLines.length, 1, "title should appear exactly once (buffer is overwritten, not appended)");
  },
});
