// =============================================================================
// File        : util_test.ts
// Author      : yukimemi
// Last Change : 2025/09/21 20:15:08.
// =============================================================================

import { assertEquals } from "@std/assert";

import { convertUrl, parseUrl } from "../util.ts";

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

Deno.test({
  name: "parseUrl with https URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const actual = parseUrl("https://github.com/yukimemi/dvpm");
    const expected = {
      hostname: "github.com",
      pathname: "/yukimemi/dvpm",
    };
    assertEquals(actual, expected);
  },
});

Deno.test({
  name: "parseUrl with git@ URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const actual = parseUrl("git@github.com:yukimemi/dvpm");
    const expected = {
      hostname: "github.com",
      pathname: "/yukimemi/dvpm",
    };
    assertEquals(actual, expected);
  },
});

Deno.test({
  name: "parseUrl with .git suffix",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const actual = parseUrl("https://github.com/yukimemi/dvpm.git");
    const expected = {
      hostname: "github.com",
      pathname: "/yukimemi/dvpm",
    };
    assertEquals(actual, expected);
  },
});
