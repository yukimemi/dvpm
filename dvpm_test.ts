// =============================================================================
// File        : dvpm_test.ts
// Author      : yukimemi
// Last Change : 2025/12/28 14:00:00.
// =============================================================================

import { assertEquals } from "@std/assert";
import { DenopsStub } from "@denops/test";
import { Dvpm } from "./dvpm.ts";

const createDenops = () => (
  new DenopsStub({
    call: (fn, ...args) => {
      return Promise.resolve([fn, ...args]);
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
