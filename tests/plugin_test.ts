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
      profile: false,
      logarg: [],
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
