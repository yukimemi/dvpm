// =============================================================================
// File        : git_test.ts
// Author      : yukimemi
// Last Change : 2024/06/30 12:59:58.
// =============================================================================

import { assertEquals } from "jsr:@std/assert@1.0.9";

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
    const expected = await git.getBranchGit();
    const actual = await git.getBranch();
    assertEquals(actual, expected);
  },
});
