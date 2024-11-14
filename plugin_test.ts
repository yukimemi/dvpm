// =============================================================================
// File        : plugin_test.ts
// Author      : yukimemi
// Last Change : 2024/11/02 15:58:07.
// =============================================================================

import { Plugin } from "./plugin.ts";
import { assertEquals } from "jsr:@std/assert@1.0.8";
import { DenopsStub } from "jsr:@denops/test@3.0.4";

const createDenops = () => (
  new DenopsStub({
    call: (fn, ...args) => {
      return Promise.resolve([fn, ...args]);
    },
  })
);

Deno.test({
  name: "Create Plugin with full URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const plug = {
      url: "https://github.com/vim-jp/vimdoc-ja",
    };
    const option = {
      base: "/tmp",
      debug: false,
      profile: false,
      logarg: [],
    };
    const plugin = await Plugin.create(denops, plug, option);
    assertEquals(plugin.info.url, "https://github.com/vim-jp/vimdoc-ja");
  },
});

Deno.test({
  name: "Create Plugin with shorthand URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const plug = {
      url: "vim-jp/vimdoc-ja",
    };
    const option = {
      base: "/tmp",
      debug: false,
      profile: false,
      logarg: [],
    };
    const plugin = await Plugin.create(denops, plug, option);
    assertEquals(plugin.info.url, "https://github.com/vim-jp/vimdoc-ja");
  },
});

Deno.test({
  name: "Create Plugin with git URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const denops = createDenops();
    const plug = {
      url: "git://github.com/vim-jp/vimdoc-ja",
    };
    const option = {
      base: "/tmp",
      debug: false,
      profile: false,
      logarg: [],
    };
    const plugin = await Plugin.create(denops, plug, option);
    assertEquals(plugin.info.url, "git://github.com/vim-jp/vimdoc-ja");
  },
});
