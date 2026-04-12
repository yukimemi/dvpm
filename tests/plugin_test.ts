// =============================================================================
// File        : plugin_test.ts
// Author      : yukimemi
// Last Change : 2025/12/31 21:47:04.
// =============================================================================

import * as path from "@std/path";
import { test } from "@denops/test";
import { Plugin } from "../plugin.ts";
import { assert, assertEquals } from "@std/assert";

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

test({
  mode: "all",
  name: "Plugin cache() generates script in correct order (init before runtimepath)",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const option = { base, profiles: [], logarg: [], clean: false };

    const plugin = await Plugin.create(denops, {
      url: "owner/repo",
      cache: {
        init: "let g:cache_init = 1",
        before: "let g:cache_before = 1",
        after: "let g:cache_after = 1",
      },
    }, option);

    const script = await plugin.cache();
    const lines = script.split("\n").filter(Boolean);

    const initIdx = lines.findIndex((l) => l.includes("cache_init"));
    const rtpIdx = lines.findIndex((l) => l.startsWith("set runtimepath+="));
    const beforeIdx = lines.findIndex((l) => l.includes("cache_before"));
    const afterIdx = lines.findIndex((l) => l.includes("cache_after"));

    assert(initIdx >= 0, "cache_init should be present in script");
    assert(rtpIdx >= 0, "set runtimepath should be present in script");
    assert(beforeIdx >= 0, "cache_before should be present in script");
    assert(afterIdx >= 0, "cache_after should be present in script");

    assert(initIdx < rtpIdx, "init must come before runtimepath");
    assert(rtpIdx < beforeIdx, "runtimepath must come before before");
    assert(beforeIdx < afterIdx, "before must come before after");
  },
});

test({
  mode: "all",
  name: "Plugin cache() places initFile content before runtimepath",
  fn: async (denops) => {
    const base = await Deno.makeTempDir();
    const option = { base, profiles: [], logarg: [], clean: false };

    const initFile = await Deno.makeTempFile({ suffix: ".vim" });
    // Extract basename to avoid path separator differences across OS/Vim expansion
    const initFileBase = initFile.replace(/\\/g, "/").split("/").pop()!;

    const plugin = await Plugin.create(denops, {
      url: "owner/repo",
      cache: { initFile },
    }, option);

    const script = await plugin.cache();
    const lines = script.split("\n").filter(Boolean);

    // getExecuteStr generates `execute 'source' fnameescape('/path/to/file.vim')`
    const initFileIdx = lines.findIndex((l) => l.includes(initFileBase));
    const rtpIdx = lines.findIndex((l) => l.startsWith("set runtimepath+="));

    assert(initFileIdx >= 0, "initFile source command should be present in script");
    assert(rtpIdx >= 0, "set runtimepath should be present in script");
    assert(initFileIdx < rtpIdx, "initFile source command must come before runtimepath");
  },
});

test({
  mode: "all",
  name: "Plugin dst as async function",
  fn: async (denops) => {
    // Warm up denops session before any logic to avoid nvim hang on Windows.
    await denops.call("abs", 1);

    const base = await Deno.makeTempDir();
    const option = { base, profiles: [], logarg: [], clean: false };
    const customDst = await Deno.makeTempDir();

    const plugin = await Plugin.create(denops, {
      url: "owner/repo",
      dst: () => Promise.resolve(customDst),
    }, option);

    assertEquals(plugin.info.dst, customDst);
    assertEquals(plugin.info.name, path.basename(customDst));
  },
});

test({
  mode: "all",
  name: "Plugin rev as async function receives resolved dst in info",
  fn: async (denops) => {
    // Warm up denops session before any logic to avoid nvim hang on Windows.
    await denops.call("abs", 1);

    const base = await Deno.makeTempDir();
    const option = { base, profiles: [], logarg: [], clean: false };

    const plugin = await Plugin.create(denops, {
      url: "owner/repo",
      rev: ({ info }) => Promise.resolve(info.dst ? "main" : "fallback"),
    }, option);

    assertEquals(plugin.info.rev, "main");
  },
});

test({
  mode: "all",
  name: "Plugin beforeFile as async function receives resolved rev in info",
  fn: async (denops) => {
    // Warm up denops session before any logic to avoid nvim hang on Windows.
    await denops.call("abs", 1);

    const base = await Deno.makeTempDir();
    const option = { base, profiles: [], logarg: [], clean: false };
    const fileA = path.join(base, "before_a.vim");
    const fileB = path.join(base, "before_b.vim");

    const plugin = await Plugin.create(denops, {
      url: "owner/repo",
      rev: "stable",
      beforeFile: ({ info }) => Promise.resolve(info.rev === "stable" ? fileA : fileB),
    }, option);

    assertEquals(plugin.info.beforeFile, fileA);
  },
});
