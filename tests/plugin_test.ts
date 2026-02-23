// =============================================================================
// File        : plugin_test.ts
// Author      : yukimemi
// Last Change : 2025/12/31 21:47:04.
// =============================================================================

import * as path from "@std/path";
import { test } from "@denops/test";
import { Plugin } from "../plugin.ts";
import { assertEquals } from "@std/assert";

test({
  mode: "all",
  name: "Plugin URL conversion test",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const option = {
      base,
      profiles: [],
      logarg: [],
      clean: false,
    };

    const testCases = [
      {
        name: "Shorthand github owner URL",
        inputUrl: "github/copilot.vim",
        expectedUrl: "https://github.com/github/copilot.vim",
        expectedPath: ["github.com", "github", "copilot.vim"],
      },
      {
        name: "https:// URL",
        inputUrl: "https://github.com/owner/repo",
        expectedUrl: "https://github.com/owner/repo",
        expectedPath: ["github.com", "owner", "repo"],
      },
      {
        name: "git:// URL",
        inputUrl: "git://github.com/owner/repo",
        expectedUrl: "git://github.com/owner/repo",
        expectedPath: ["github.com", "owner", "repo"],
      },
      {
        name: "ssh:// URL",
        inputUrl: "ssh://github.com/owner/repo",
        expectedUrl: "ssh://github.com/owner/repo",
        expectedPath: ["github.com", "owner", "repo"],
      },
      {
        name: "git@ URL",
        inputUrl: "git@github.com:owner/repo",
        expectedUrl: "git@github.com:owner/repo",
        expectedPath: ["github.com", "owner", "repo"],
      },
      {
        name: "http:// URL",
        inputUrl: "http://github.com/owner/repo",
        expectedUrl: "http://github.com/owner/repo",
        expectedPath: ["github.com", "owner", "repo"],
      },
      {
        name: "https:// URL with .git suffix",
        inputUrl: "https://github.com/owner/repo.git",
        expectedUrl: "https://github.com/owner/repo.git",
        expectedPath: ["github.com", "owner", "repo"],
      },
      {
        name: "git@ URL with .git suffix",
        inputUrl: "git@github.com:owner/repo.git",
        expectedUrl: "git@github.com:owner/repo.git",
        expectedPath: ["github.com", "owner", "repo"],
      },
    ];

    for (const testCase of testCases) {
      const plug = {
        url: testCase.inputUrl,
      };
      const plugin = await Plugin.create(denops, plug, option);
      assertEquals(
        plugin.info.url,
        testCase.expectedUrl,
        `Test Case: ${testCase.name} - url`,
      );
      assertEquals(
        plugin.info.dst,
        path.join(base, ...testCase.expectedPath),
        `Test Case: ${testCase.name} - dst`,
      );
    }
  },
});

test({
  mode: "all",
  name: "Plugin clean option priority test",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();

    // Global clean: true
    const option = {
      base,
      profiles: [],
      logarg: [],
      clean: true,
    };

    // 1. No dst, no explicit clean -> follows global (true)
    const p1 = await Plugin.create(denops, { url: "owner/p1" }, option);
    assertEquals(p1.info.clean, true, "p1: should be true (global)");

    // 2. dst specified, no explicit clean -> should be false
    const p2 = await Plugin.create(denops, { url: "owner/p2", dst: "~/src/p2" }, option);
    assertEquals(p2.info.clean, false, "p2: should be false (dst specified)");

    // 3. dst specified, but explicit clean: true -> should be true
    const p3 = await Plugin.create(
      denops,
      { url: "owner/p3", dst: "~/src/p3", clean: true },
      option,
    );
    assertEquals(p3.info.clean, true, "p3: should be true (explicit clean)");

    // 4. No dst, but explicit clean: false -> should be false
    const p4 = await Plugin.create(denops, { url: "owner/p4", clean: false }, option);
    assertEquals(p4.info.clean, false, "p4: should be false (explicit clean)");
  },
});
