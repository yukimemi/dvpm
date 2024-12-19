// =============================================================================
// File        : util_test.ts
// Author      : yukimemi
// Last Change : 2024/11/02 15:32:24.
// =============================================================================

import { assertEquals } from "jsr:@std/assert@1.0.10";

import { convertUrl } from "./util.ts";

Deno.test({
  name: "convertUrl with repository path",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const actual = convertUrl("vim-jp/vimdoc-ja");
    const expected = "https://github.com/vim-jp/vimdoc-ja";
    assertEquals(actual, expected);
  },
});

Deno.test({
  name: "convertUrl with https URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const actual = convertUrl("https://github.com/vim-jp/vimdoc-ja");
    const expected = "https://github.com/vim-jp/vimdoc-ja";
    assertEquals(actual, expected);
  },
});

Deno.test({
  name: "convertUrl with git URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const actual = convertUrl("git://github.com/vim-jp/vimdoc-ja");
    const expected = "git://github.com/vim-jp/vimdoc-ja";
    assertEquals(actual, expected);
  },
});
