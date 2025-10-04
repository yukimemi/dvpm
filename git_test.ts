// =============================================================================
// File        : git_test.ts
// Author      : yukimemi
// Last Change : 2025/10/04 19:47:11.
// =============================================================================

import { assertEquals } from "@std/assert";

import { Git } from "./git.ts";

async function init() {
  const repo = "https://github.com/yukimemi/dvpm";
  const dst = await Deno.makeTempDir();
  await Git.clone(repo, dst);
  const git = new Git(dst);
  return git;
}

Deno.test({
  name: "Test getRevision",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const git = await init();
    const expected = await git.getRevisionGit();
    const actual = await git.getRevision();
    assertEquals(actual, expected);
  },
});

Deno.test({
  name: "Test getBranch",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const git = await init();
    const expected = "main";
    const actual = await git.getBranch();
    assertEquals(actual, expected);
  },
});
