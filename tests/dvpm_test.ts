// =============================================================================
// File        : dvpm_test.ts
// Author      : yukimemi
// Last Change : 2025/12/28 14:00:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { assertSpyCall, stub } from "@std/testing/mock";
import { DenopsStub } from "@denops/test";
import { Dvpm } from "../dvpm.ts";

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
  name: "Dvpm.bufWriteList includes profiles",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, {
      base: "/tmp/dvpm",
      profiles: ["profile1"],
    });

    await dvpm.add({
      url: "https://github.com/yukimemi/dvpm",
      profiles: ["profile1", "profile2"],
    });

    let capturedData: string[] = [];
    // deno-lint-ignore no-explicit-any
    (dvpm as any).bufWrite = (_bufname: string, data: string[]) => {
      capturedData = data;
      return Promise.resolve(1);
    };

    await dvpm.bufWriteList();

    const header = capturedData[0];
    const pluginLine = capturedData[2];

    assertEquals(header.includes("profiles"), true, "Header should include 'profiles'");
    assertEquals(
      pluginLine.includes("profile1,profile2"),
      true,
      "Plugin line should include profiles",
    );
  },
});

Deno.test({
  name: "Dvpm.bufWriteList hides profiles column when no profiles exist",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, {
      base: "/tmp/dvpm",
      profiles: ["profile1"],
    });

    await dvpm.add({
      url: "https://github.com/yukimemi/dvpm",
      // No profiles specified
    });

    let capturedData: string[] = [];
    // deno-lint-ignore no-explicit-any
    (dvpm as any).bufWrite = (_bufname: string, data: string[]) => {
      capturedData = data;
      return Promise.resolve(1);
    };

    await dvpm.bufWriteList();

    const header = capturedData[0];
    const pluginLine = capturedData[2];

    assertEquals(header.includes("profiles"), false, "Header should NOT include 'profiles'");
    assertEquals(
      pluginLine.includes("https://github.com/yukimemi/dvpm"),
      true,
      "Plugin line should include the URL",
    );
  },
});

Deno.test({
  name: "Dvpm.add adds a plugin to the list",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, {
      base: "/tmp/dvpm",
    });

    await dvpm.add({
      url: "https://github.com/yukimemi/dvpm",
    });

    assertEquals(dvpm.plugins.length, 1);
    assertEquals(dvpm.plugins[0].info.url, "https://github.com/yukimemi/dvpm");
  },
});

Deno.test({
  name: "Dvpm.list returns unique plugins",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, {
      base: "/tmp/dvpm",
    });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" }); // Duplicate

    const plugins = dvpm.list();

    assertEquals(plugins.length, 1);
    assertEquals(plugins[0].info.url, "https://github.com/yukimemi/dvpm");
  },
});

Deno.test({
  name: "Dvpm.end calls plugin lifecycle methods",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const dvpm = new Dvpm(denops, {
      base: "/tmp/dvpm",
    });

    await dvpm.add({ url: "https://github.com/yukimemi/dvpm" });
    const plugin = dvpm.plugins[0];

    // Stub plugin methods
    // deno-lint-ignore no-explicit-any
    const installStub = stub(plugin, "install" as any, () => Promise.resolve([]));
    // deno-lint-ignore no-explicit-any
    const addRuntimepathStub = stub(plugin, "addRuntimepath" as any, () => Promise.resolve(true));
    // deno-lint-ignore no-explicit-any
    const sourceStub = stub(plugin, "source" as any, () => Promise.resolve());
    // deno-lint-ignore no-explicit-any
    const denopsPluginLoadStub = stub(plugin, "denopsPluginLoad" as any, () => Promise.resolve());
    // deno-lint-ignore no-explicit-any
    const buildStub = stub(plugin, "build" as any, () => Promise.resolve());

    try {
      await dvpm.end();

      assertSpyCall(installStub, 0);
      assertSpyCall(addRuntimepathStub, 0);
      assertSpyCall(sourceStub, 0);
      assertSpyCall(denopsPluginLoadStub, 0);
    } finally {
      installStub.restore();
      addRuntimepathStub.restore();
      sourceStub.restore();
      denopsPluginLoadStub.restore();
      buildStub.restore();
    }
  },
});
