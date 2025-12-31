// =============================================================================
// File        : lazy_test.ts
// Author      : yukimemi
// Last Change : 2025/12/31 00:00:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { assertSpyCall, stub } from "@std/testing/mock";
import { DenopsStub } from "@denops/test";
import { Dvpm } from "../dvpm.ts";
import type { Plugin } from "../plugin.ts";

const createDenops = () => (
  new DenopsStub({
    call: (fn, ...args) => {
      return Promise.resolve([fn, ...args]);
    },
    cmd: (_cmd, ..._args) => {
      return Promise.resolve();
    },
  })
);

Deno.test({
  name: "Lazy Loading: eager plugins are loaded at end()",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, { base: "/tmp/dvpm" });

    await dvpm.add({ url: "eager/plugin" });
    await dvpm.add({ url: "lazy/plugin", lazy: true });

    // deno-lint-ignore no-explicit-any
    const loadPluginsStub = stub(dvpm as any, "loadPlugins", () => Promise.resolve());
    // deno-lint-ignore no-explicit-any
    const fireStub = stub(dvpm as any, "fire", () => Promise.resolve());
    // deno-lint-ignore no-explicit-any
    stub(dvpm as any, "install", () => Promise.resolve());

    try {
      await dvpm.end();

      // eagerPlugin should be passed to loadPlugins
      assertSpyCall(loadPluginsStub, 0, {
        args: [[dvpm.plugins[0]]],
      });
      // lazyPlugin should be passed to _fire
      assertSpyCall(fireStub, 0, {
        args: [[dvpm.plugins[1]]],
      });
    } finally {
      loadPluginsStub.restore();
      fireStub.restore();
    }
  },
});

Deno.test({
  name: "Lazy Loading: lazy plugins are promoted to eager if depended on by eager plugins",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, { base: "/tmp/dvpm" });

    // eager depends on lazy
    await dvpm.add({ url: "eager/plugin", dependencies: ["lazy/plugin"] });
    await dvpm.add({ url: "lazy/plugin", lazy: true });

    // deno-lint-ignore no-explicit-any
    const loadPluginsStub = stub(dvpm as any, "loadPlugins", () => Promise.resolve());
    // deno-lint-ignore no-explicit-any
    const fireStub = stub(dvpm as any, "fire", () => Promise.resolve());
    // deno-lint-ignore no-explicit-any
    stub(dvpm as any, "install", () => Promise.resolve());

    try {
      await dvpm.end();

      // Both should be in eager plugins (order: dependency first)
      const call = loadPluginsStub.calls[0];
      const loadedPlugins = call.args[0] as Plugin[];
      assertEquals(loadedPlugins.length, 2);
      assertEquals(
        loadedPlugins.some((p) => p.info.url === "https://github.com/lazy/plugin"),
        true,
      );
      assertEquals(
        loadedPlugins.some((p) => p.info.url === "https://github.com/eager/plugin"),
        true,
      );

      // _fire should be called with empty list
      assertSpyCall(fireStub, 0, {
        args: [[]],
      });
    } finally {
      loadPluginsStub.restore();
      fireStub.restore();
    }
  },
});

Deno.test({
  name: "Lazy Loading: load() recursively loads dependencies",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, { base: "/tmp/dvpm" });

    // lazy1 depends on lazy2
    await dvpm.add({ url: "lazy1", lazy: true, dependencies: ["lazy2"] });
    await dvpm.add({ url: "lazy2", lazy: true });

    const lazy1 = dvpm.plugins[0];
    const lazy2 = dvpm.plugins[1];

    // deno-lint-ignore no-explicit-any
    const loadPluginsStub = stub(dvpm as any, "loadPlugins", () => Promise.resolve());

    try {
      // Load lazy1
      await dvpm.load("lazy1", "event", "BufRead");

      // Both should be loaded, lazy2 first
      assertSpyCall(loadPluginsStub, 0, {
        args: [[lazy2, lazy1]],
      });
    } finally {
      loadPluginsStub.restore();
    }
  },
});
