// =============================================================================
// File        : tests/autocmd_test.ts
// Author      : yukimemi
// Last Change : 2025/01/01 00:00:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { test } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

test({
  mode: "all",
  name: "Dvpm triggers User autocmd 'Dvpm:PreLoad:pluginname' and 'Dvpm:PostLoad:pluginname'",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    const pluginUrl = "https://github.com/yukimemi/dvpm";
    const preLoadEvent = "Dvpm:PreLoad:dvpm";
    const postLoadEvent = "Dvpm:PostLoad:dvpm";

    await dvpm.add({ url: pluginUrl });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await denops.cmd(`let g:dvpm_test_preload_fired = 0`);
    await denops.cmd(`let g:dvpm_test_postload_fired = 0`);

    // Check execution order using a list
    await denops.cmd(`let g:dvpm_test_event_order = []`);

    await denops.cmd(
      `autocmd User ${preLoadEvent} let g:dvpm_test_preload_fired = 1 | call add(g:dvpm_test_event_order, 'pre')`,
    );
    await denops.cmd(
      `autocmd User ${postLoadEvent} let g:dvpm_test_postload_fired = 1 | call add(g:dvpm_test_event_order, 'post')`,
    );

    await dvpm.end();

    const preFired = await denops.eval("g:dvpm_test_preload_fired");
    const postFired = await denops.eval("g:dvpm_test_postload_fired");
    const order = await denops.eval("g:dvpm_test_event_order");

    assertEquals(preFired, 1, `User autocmd '${preLoadEvent}' should be fired`);
    assertEquals(postFired, 1, `User autocmd '${postLoadEvent}' should be fired`);
    assertEquals(order, ["pre", "post"], "Events should fire in correct order");
  },
});

test({
  mode: "all",
  name: "Dvpm triggers User autocmd only when lazy plugin is loaded",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    const pluginUrl = "https://github.com/yukimemi/dvpm_lazy";
    const preLoadEvent = "Dvpm:PreLoad:dvpm_lazy";
    const postLoadEvent = "Dvpm:PostLoad:dvpm_lazy";

    // Add a lazy plugin (cmd option implies lazy)
    await dvpm.add({ url: pluginUrl, cmd: "TestLazyCmd" });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await denops.cmd(`let g:dvpm_test_lazy_preload = 0`);
    await denops.cmd(`let g:dvpm_test_lazy_postload = 0`);

    await denops.cmd(`autocmd User ${preLoadEvent} let g:dvpm_test_lazy_preload = 1`);
    await denops.cmd(`autocmd User ${postLoadEvent} let g:dvpm_test_lazy_postload = 1`);

    // Run end(). Since it's lazy, it should NOT load yet.
    await dvpm.end();

    let preFired = await denops.eval("g:dvpm_test_lazy_preload");
    let postFired = await denops.eval("g:dvpm_test_lazy_postload");
    assertEquals(preFired, 0, "PreLoad should NOT be fired yet for lazy plugin");
    assertEquals(postFired, 0, "PostLoad should NOT be fired yet for lazy plugin");

    // Manually trigger load (simulating the command execution)
    await dvpm.load(pluginUrl, "cmd", "TestLazyCmd");

    preFired = await denops.eval("g:dvpm_test_lazy_preload");
    postFired = await denops.eval("g:dvpm_test_lazy_postload");
    assertEquals(preFired, 1, "PreLoad SHOULD be fired after loading");
    assertEquals(postFired, 1, "PostLoad SHOULD be fired after loading");
  },
});

test({
  mode: "all",
  name: "Dvpm uses custom name for User autocmd",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const dvpm = new Dvpm(denops, { base });

    const pluginUrl = "https://github.com/yukimemi/dvpm";
    const customName = "custom-dvpm-name";
    const postLoadEvent = `Dvpm:PostLoad:${customName}`;

    await dvpm.add({ url: pluginUrl, name: customName });

    const plugin = dvpm.plugins[0];
    plugin.install = () => Promise.resolve([]);
    plugin.update = () => Promise.resolve([]);
    plugin.build = () => Promise.resolve();
    await Deno.mkdir(plugin.info.dst, { recursive: true });

    await denops.cmd(`let g:dvpm_test_custom_name_fired = 0`);
    await denops.cmd(`autocmd User ${postLoadEvent} let g:dvpm_test_custom_name_fired = 1`);

    await dvpm.end();

    const fired = await denops.eval("g:dvpm_test_custom_name_fired");
    assertEquals(fired, 1, `User autocmd '${postLoadEvent}' should be fired with custom name`);
  },
});
