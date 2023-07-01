import * as git from "https://esm.sh/simple-git@3.19.1/";
import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";

import { Git } from "./git.ts";

async function init() {
  const repo = "https://github.com/yukimemi/dvpm";
  const dst = await Deno.makeTempDir();
  await git.simpleGit().clone(repo, dst);
  return git.simpleGit(dst).env({ ...Deno.env.toObject() });
}

Deno.test({
  name: "Test getRevisiont",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const g = await init();
    const expected = await g.revparse("HEAD");
    const git = new Git(await g.revparse(["--show-toplevel"]));
    const actual = await git.getRevision();
    assertEquals(actual, expected);
  },
});

Deno.test({
  name: "Test getBranch",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const g = await init();
    const expected = (await g.branch()).current;
    const git = new Git(await g.revparse(["--show-toplevel"]));
    const actual = await git.getBranch();
    assertEquals(actual, expected);
  },
});
