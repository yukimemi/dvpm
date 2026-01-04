// =============================================================================
// File        : tests/health_test.ts
// Author      : yukimemi
// Last Change : 2026/01/04 18:30:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { test } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

test({
  mode: "all",
  name: "Dvpm automatically adds yukimemi/dvpm when health is true",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    // health: true is default
    const dvpm = await Dvpm.begin(denops, { base, health: true });

    // Mock install for all plugins to avoid git clone
    const originalAdd = dvpm.add.bind(dvpm);
    dvpm.add = async (plug) => {
      await originalAdd(plug);
      const p = dvpm.plugins[dvpm.plugins.length - 1];
      if (p) {
        p.install = () => Promise.resolve([]);
        p.update = () => Promise.resolve([]);
        p.build = () => Promise.resolve();
      }
    };

    await dvpm.end();

    const plugins = dvpm.plugins;
    const hasDvpm = plugins.some((p) => p.info.url === "https://github.com/yukimemi/dvpm");
    assertEquals(hasDvpm, true, "yukimemi/dvpm should be automatically added");

    const pluginName = await denops.call("eval", "g:dvpm_plugin_name");
    assertEquals(pluginName, denops.name, "g:dvpm_plugin_name should be set to denops.name");
  },
});

test({
  mode: "all",
  name: "Dvpm.checkHealth returns correct results",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    // Normal state
    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    const results = await dvpm.checkHealth();

    const infoCount = results.filter((r) => r.type === "info").length;
    const okCount = results.filter((r) => r.type === "ok").length;

    assertEquals(infoCount >= 2, true, "Should have info logs for environment and plugin check");
    assertEquals(okCount >= 3, true, "Should have ok logs for Denops, Deno, Git, and plugins");
  },
});

test({
  mode: "all",
  name: "Dvpm.checkHealth detects duplicates and missing dependencies",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    // Duplicate
    await dvpm.add({ url: "https://github.com/user/repo" });
    await dvpm.add({ url: "https://github.com/user/repo" });

    // Missing dependency
    await dvpm.add({
      url: "https://github.com/user/dep-plugin",
      dependencies: ["https://github.com/user/non-existent"],
    });

    const results = await dvpm.checkHealth();
    const errors = results.filter((r) => r.type === "error");

    const hasDuplicateError = errors.some((e) => e.msg.includes("Duplicate plugin defined"));
    const hasDepError = errors.some((e) =>
      e.msg.includes("depends on https://github.com/user/non-existent, but it is not defined")
    );

    assertEquals(hasDuplicateError, true, "Should detect duplicate plugins");
    assertEquals(hasDepError, true, "Should detect missing dependencies");
  },
});

test({
  mode: "nvim",
  name: "Dvpm health check via autoload function works",
  fn: async (denops) => {
    // Current directory (dvpm project root)
    const cwd = Deno.cwd();
    await denops.cmd(`set runtimepath^=${cwd}`);

    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base, health: false });

    // Explicitly add dvpm plugin pointing to current directory
    await dvpm.add({
      url: "yukimemi/dvpm",
      dst: cwd,
    });

    await denops.cmd(`let g:dvpm_plugin_name = '${denops.name}'`);

    // Execute health check via autoload function
    await denops.call("health#dvpm#check");
  },
});

test({
  mode: "vim",
  name: "DvpmCheckHealth command works in Vim",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = await Dvpm.begin(denops, { base, health: false });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });

    // Command should exist and run without error
    await denops.cmd("DvpmCheckHealth");

    // Wait for buffer to be opened (notify is async)
    let bufname = "";
    for (let i = 0; i < 20; i++) {
      bufname = await denops.call("bufname", "%") as string;
      if (bufname === "dvpm://checkhealth") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assertEquals(bufname, "dvpm://checkhealth");

    // Check buffer content
    const lines = await denops.call("getline", 1, "$") as string[];
    const hasEnvironmentCheck = lines.some((l) => l.includes("Environment check"));
    assertEquals(hasEnvironmentCheck, true, "Buffer should contain health check results");
  },
});
