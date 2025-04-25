// =============================================================================
// File        : plugin_test.ts
// Author      : yukimemi
// Last Change : 2025/01/26 16:41:56.
// =============================================================================

import * as path from "jsr:@std/path@1.0.8";
import { DenopsStub } from "jsr:@denops/test@3.0.4";
import { Plugin } from "./plugin.ts";
import { assertEquals } from "jsr:@std/assert@1.0.13";

const createDenops = () => (
  new DenopsStub({
    call: (fn, ...args) => {
      return Promise.resolve([fn, ...args]);
    },
  })
);

Deno.test({
  name: "Plugin URL conversion test",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const option = {
      base: "/tmp",
      debug: false,
      profiles: [],
      profile: false,
      logarg: [],
    };

    const testCases = [
      {
        name: "Shorthand github owner URL",
        inputUrl: "github/copilot.vim",
        expectedUrl: "https://github.com/github/copilot.vim",
        expectedDst: path.join("/tmp", "github.com", "github", "copilot.vim"),
      },
      {
        name: "https:// URL",
        inputUrl: "https://github.com/owner/repo",
        expectedUrl: "https://github.com/owner/repo",
        expectedDst: path.join("/tmp", "github.com", "owner", "repo"),
      },
      {
        name: "git:// URL",
        inputUrl: "git://github.com/owner/repo",
        expectedUrl: "git://github.com/owner/repo",
        expectedDst: path.join("/tmp", "github.com", "owner", "repo"),
      },
      {
        name: "ssh:// URL",
        inputUrl: "ssh://github.com/owner/repo",
        expectedUrl: "ssh://github.com/owner/repo",
        expectedDst: path.join("/tmp", "github.com", "owner", "repo"),
      },
      {
        name: "git@ URL",
        inputUrl: "git@github.com:owner/repo",
        expectedUrl: "git@github.com:owner/repo",
        expectedDst: path.join("/tmp", "github.com", "owner", "repo"),
      },
      {
        name: "http:// URL",
        inputUrl: "http://github.com/owner/repo",
        expectedUrl: "http://github.com/owner/repo",
        expectedDst: path.join("/tmp", "github.com", "owner", "repo"),
      },
      {
        name: "https:// URL with .git suffix",
        inputUrl: "https://github.com/owner/repo.git",
        expectedUrl: "https://github.com/owner/repo.git",
        expectedDst: path.join("/tmp", "github.com", "owner", "repo"),
      },
      {
        name: "git@ URL with .git suffix",
        inputUrl: "git@github.com:owner/repo.git",
        expectedUrl: "git@github.com:owner/repo.git",
        expectedDst: path.join("/tmp", "github.com", "owner", "repo"),
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
        testCase.expectedDst,
        `Test Case: ${testCase.name} - dst`,
      );
    }
  },
});
