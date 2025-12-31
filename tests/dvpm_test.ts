// =============================================================================
// File        : dvpm_test.ts
// Author      : yukimemi
// Last Change : 2025/12/31 21:46:48.
// =============================================================================

import { assertEquals } from "@std/assert";
import { test } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

test({
  mode: "nvim",
  name: "Dvpm.bufWriteList includes profiles",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, {
      base,
      profiles: ["profile1"],
    });

    await dvpm.add({
      url: "https://github.com/yukimemi/dvpm",
      profiles: ["profile1", "profile2"],
    });

    await dvpm.bufWriteList();

    const bufnr = await denops.call("bufnr", "dvpm://list");
    const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];

    const header = lines[0];
    const pluginLine = lines.find((l) => l.includes("yukimemi/dvpm"));

    assertEquals(header.includes("profiles"), true, "Header should include 'profiles'");
    assertEquals(
      pluginLine?.includes("profile1,profile2"),
      true,
      "Plugin line should include profiles",
    );
  },
});

test({
  mode: "nvim",
  name: "Dvpm.bufWriteList hides profiles column when no profiles exist",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, {
      base,
      profiles: ["profile1"],
    });

    await dvpm.add({
      url: "https://github.com/yukimemi/dvpm",
      // No profiles specified
    });

    await dvpm.bufWriteList();

    const bufnr = await denops.call("bufnr", "dvpm://list");
    const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];

    const header = lines[0];
    const pluginLine = lines.find((l) => l.includes("yukimemi/dvpm"));

    assertEquals(header.includes("profiles"), false, "Header should NOT include 'profiles'");
    assertEquals(
      pluginLine?.includes("https://github.com/yukimemi/dvpm"),
      true,
      "Plugin line should include the URL",
    );
  },
});

test({
  mode: "nvim",
  name: "Dvpm.add adds a plugin to the list",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, {
      base,
    });

    await dvpm.add({
      url: "https://github.com/yukimemi/dvpm",
    });

    assertEquals(dvpm.plugins.length, 1);
    assertEquals(dvpm.plugins[0].info.url, "https://github.com/yukimemi/dvpm");
  },
});

test({
  mode: "nvim",
  name: "Dvpm.list returns unique plugins",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, {
      base,
    });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" }); // Duplicate

    const plugins = dvpm.list();

    assertEquals(plugins.length, 1);
    assertEquals(plugins[0].info.url, "https://github.com/yukimemi/dvpm");
  },
});

test({
  mode: "nvim",
  name: "Dvpm.end runs without error",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, {
      base,
    });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });

    // We just check if it runs without throwing errors for now,
    // as full lifecycle testing with stubs on a real denops instance is complex
    // without properly mocking git clone etc.
    // However, end() triggers install() which triggers git clone.
    // If we want to avoid network access, we should probably mock Plugin.install or use a local git repo.
    // For this smoke test, we'll let it try, but it might fail if git is missing or network is down.
    // To make it safe, we can mock the install method of the plugin instance before calling end.

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();

    await dvpm.end();

    assertEquals(true, true);
  },
});
