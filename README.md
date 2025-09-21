# dvpm - Denops Vim/Neovim Plugin Manager !

[![DeepWiki](https://img.shields.io/badge/DeepWiki-yukimemi%2Fdvpm-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/yukimemi/dvpm)

`dvpm` is a plugin manager for Vim and Neovim, powered by
[denops.vim](https://github.com/vim-denops/denops.vim).

- Vim / Neovim starts up very fast !

<div align="center">
  <img src="https://github.com/yukimemi/files/blob/main/dvpm/startuptime.png?raw=true" title="startuptime" />
</div>

...but plugins are not loaded yet at startup ＼(^o^)／

All plugins are loaded lazily.

- You can write all Vim / Neovim settings in typescript

## Requirement

- [Deno - A modern runtime for JavaScript and TypeScript](https://deno.land/)

## Sample configuration

### Neovim

- ~/.config/nvim/init.lua (Mac / Linux)
- ~/AppData/Local/nvim/init.lua (Windows)

```lua
local denops = vim.fn.expand("~/.cache/nvim/dvpm/github.com/vim-denops/denops.vim")
if not vim.loop.fs_stat(denops) then
  vim.fn.system({ "git", "clone", "https://github.com/vim-denops/denops.vim", denops })
end
vim.opt.runtimepath:prepend(denops)
```

### Vim

- `~/.vimrc` (Mac / Linux)
- `~/_vimrc` (Windows)

```vim
let s:denops = expand("~/.cache/vim/dvpm/github.com/vim-denops/denops.vim")
if !isdirectory(s:denops)
  execute 'silent! !git clone https://github.com/vim-denops/denops.vim ' .. s:denops
endif
execute 'set runtimepath^=' . substitute(fnamemodify(s:denops, ':p') , '[/\\]$', '', '')
```

---

### Neovim

- ~/.config/nvim/denops/config/main.ts (Mac / Linux)
- ~/AppData/Local/nvim/denops/config/main.ts (Windows)

### Vim

- ~/.vim/denops/config/main.ts (Mac / Linux)
- ~/vimfiles/denops/config/main.ts (Windows)

```typescript
import type { Denops, Entrypoint } from "@denops/std";
import * as fn from "@denops/std/function";
import * as mapping from "@denops/std/mapping";
import * as vars from "@denops/std/variable";
import { ensure, is } from "@core/unknownutil";
import { execute } from "@denops/std/helper";

import { Dvpm } from "@yukimemi/dvpm";

export const main: Entrypoint = async (denops: Denops) => {
  const base_path = (await fn.has(denops, "nvim")) ? "~/.cache/nvim/dvpm" : "~/.cache/vim/dvpm";
  const base = ensure(await fn.expand(denops, base_path), is.String);

  // First, call Dvpm.begin with denops object and base path.
  const dvpm = await Dvpm.begin(denops, { base });

  // URL only (GitHub).
  await dvpm.add({ url: "yukimemi/autocursor.vim" });
  // URL only (not GitHub).
  await dvpm.add({ url: "https://notgithub.com/some/other/plugin" });
  // With branch.
  // await dvpm.add({ url: "neoclide/coc.nvim", branch: "release" });
  // build option. Execute after install or update.
  await dvpm.add({
    url: "neoclide/coc.nvim",
    branch: "master",
    build: async ({ info }) => {
      if (!info.isUpdate || !info.isLoad) {
        // build option is called after git pull, even if there are no changes
        // so you need to check for changes
        return;
      }
      const args = ["install", "--frozen-lockfile"];
      const cmd = new Deno.Command("yarn", { args, cwd: info.dst });
      const output = await cmd.output();
      console.log(new TextDecoder().decode(output.stdout));
    },
  });
  // shalow clone.
  await dvpm.add({ url: "yukimemi/chronicle.vim", depth: 1 });
  // before setting.
  await dvpm.add({
    url: "yukimemi/silentsaver.vim",
    before: async ({ denops }) => {
      await vars.g.set(
        denops,
        "silentsaver_dir",
        ensure(await fn.expand(denops, "~/.cache/nvim/silentsaver"), is.String),
      );
    },
  });
  // after setting.
  await dvpm.add({
    url: "folke/which-key.nvim",
    after: async ({ denops }) => {
      await execute(denops, `lua require("which-key").setup()`);
    },
  });
  // dst setting. (for develop)
  await dvpm.add({
    url: "yukimemi/spectrism.vim",
    dst: "~/src/github.com/yukimemi/spectrism.vim",
    before: async ({ denops }) => {
      await mapping.map(denops, "<space>ro", "<cmd>ChangeColorscheme<cr>", {
        mode: "n",
      });
      await mapping.map(
        denops,
        "<space>rd",
        "<cmd>DisableThisColorscheme<cr>",
        { mode: "n" },
      );
      await mapping.map(denops, "<space>rl", "<cmd>LikeThisColorscheme<cr>", {
        mode: "n",
      });
      await mapping.map(denops, "<space>rh", "<cmd>HateThisColorscheme<cr>", {
        mode: "n",
      });
    },
  });
  // Disable setting.
  await dvpm.add({
    url: "yukimemi/hitori.vim",
    enabled: false,
  });
  // Disable with function.
  await dvpm.add({
    url: "editorconfig/editorconfig-vim",
    enabled: async ({ denops }) => !(await fn.has(denops, "nvim")),
  });
  // With dependencies. dependencies plugin must be added.
  await dvpm.add({ url: "lambdalisue/askpass.vim" });
  await dvpm.add({ url: "lambdalisue/guise.vim" });
  await dvpm.add({
    url: "lambdalisue/gin.vim",
    dependencies: [
      "lambdalisue/askpass.vim",
      "lambdalisue/guise.vim",
    ],
  });
  // Load from file. ( `.lua` or `.vim` )
  await dvpm.add({
    url: "rcarriga/nvim-notify",
    beforeFile: "~/.config/nvim/rc/before/nvim-notify.lua",
    afterFile: "~/.config/nvim/rc/after/nvim-notify.lua",
  });

  // Finally, call Dvpm.end.
  await dvpm.end();

  console.log("Load completed !");
};
```

See my dotfiles for more complex examples.

[dotfiles/.config/nvim at main · yukimemi/dotfiles · GitHub](https://github.com/yukimemi/dotfiles/tree/main/.config/nvim)

## API

### Dvpm.begin

```typescript
public static async begin(denops: Denops, dvpmOption: DvpmOption): Promise<Dvpm>
```

```typescript
export type DvpmOption = {
  // Base path for git clone.
  base: string;
  // Cache file path. See `Cache setting`.
  cache?: string;
  // debug print. Default is false.
  debug?: boolean;
  // If specified in profiles, only plugins that match the profiles specified in `Plug` will be loaded
  // See `Profile setting`
  profiles?: string[];
  // Number of concurrent processes. Default is 8.
  // This is used plugin install, update, source.
  concurrency?: number;
  // Use `vim.notify` for Install and Update log. Default is false. (Neovim only)
  notify?: boolean;
  // git log arg. Used for :DvpmUpdate command output. Default is [].
  logarg?: string[];
};
```

### Dvpm.end

```typescript
public async end(): Promise<void>
```

Add plugin to runtimepath and source plugin/*.vim and plugin/*.lua.

### Dvpm.add

```typescript
public async add(plug: Plug): Promise<void>
```

```typescript
export type Plug = {
  // Github `username/repository` or URL that can be cloned with git.
  url: string;
  // The path to git clone. (Option)
  dst?: string;
  // Git branch or revision name. (Option)
  rev?: string;
  // clone depth. (Option)
  depth?: number;
  // enable or disable. Default is true.
  enabled?: Bool;
  // If profiles are specified in DvpmOption, the plugin will be enabled only if the profiles specified here are included in the profiles of DvpmOption.
  profiles: string[];
  // Processing to be performed before source plugin/*.vim and plugin/*.lua. (Option)
  before?: ({
    denops,
    info,
  }: {
    denops: Denops;
    info: PlugInfo;
  }) => Promise<void>;
  // Processing to be performed after source plugin/*.vim and plugin/*.lua. (Option)
  after?: ({
    denops,
    info,
  }: {
    denops: Denops;
    info: PlugInfo;
  }) => Promise<void>;
  // File path of processing to be performed before source plugin/*.vim and plugin/*.lua. (Option)
  beforeFile?: string;
  // File path of processing to be performed after source plugin/*.vim and plugin/*.lua. (Option)
  afterFile?: string;
  // build option. Execute after install or update. (Option)
  // Executed even if there are no changes in the update
  // Therefore, conditionally branch on `info.isLoad` and `info.isUpdate` as necessary
  build?: ({
    denops,
    info,
  }: {
    denops: Denops;
    info: PlugInfo;
  }) => Promise<void>;
  // Cache settings. See `Cache setting`.
  cache?: {
    enabled?: Bool;
    before?: string;
    after?: string;
    beforeFile?: string;
    afterFile?: string;
  };
  // Whether to git clone and update. Default is true. (Option)
  // If this option is set to false, then `enabled` is also set to false.
  clone?: Bool;
  // dependencies. (Option)
  dependencies?: string[];
};
```

```typescript
export type Bool =
  | boolean
  | (({
    denops,
    info,
  }: {
    denops: Denops;
    info: PlugInfo;
  }) => Promise<boolean>);
```

`PlugInfo` type is almost same as `Plug`.
Contains the calculated results for each variable, such as `enabled`.

### Dvpm.cache

```typescript
public async cache(arg: { script: string; path: string }): Promise<void>
```

Cache the script to path.

e.g.

```typescript
await dvpm.cache({
  script: `
    if !v:vim_did_enter && has('reltime')
      let s:startuptime = reltime()
      au VimEnter * ++once let s:startuptime = reltime(s:startuptime) | redraw
            \\ | echomsg 'startuptime: ' .. reltimestr(s:startuptime)
    endif
  `,
  path: "~/.config/nvim/plugin/dvpm_cache.vim",
});

await dvpm.cache({
  script: `
    vim.g.loaded_2html_plugin = 1
    vim.g.loaded_gzip = 1
    vim.g.loaded_man = 1
    vim.g.loaded_matchit = 1
    vim.g.loaded_matchparen = 1
    vim.g.loaded_netrwPlugin = 1
    vim.g.loaded_tarPlugin = 1
    vim.g.loaded_tutor_mode_plugin = 1
    vim.g.loaded_zipPlugin = 1
  `,
  path: "~/.config/nvim/plugin/dvpm_cache.lua",
});
```

### Dvpm.list

```typescript
public list(): Plugin[]
```

If you want a list of plugin information, you can get it with the dvpm.list() function. The return
value is `Plugin[]`. See the [doc](https://jsr.io/@yukimemi/dvpm/doc/~/Plugin) for type information.

## Command

```vim
:DvpmUpdate [url]
```

Update installed plugins.

If url is specified, update only target plugins, if not specified, update all plugins.

```vim
:DvpmList
```

It outputs the list of plugins to the dvpm://list buffer.

## Cache setting

If you want some plugins to be loaded before VimEnter, enable the `cache` setting. A sample
configuration is shown below.

```typescript
export const main: Entrypoint = async (denops: Denops) => {
  const base_path = (await fn.has(denops, "nvim")) ? "~/.cache/nvim/dvpm" : "~/.cache/vim/dvpm";
  const base = ensure(await fn.expand(denops, base_path), is.String);
  const cache_path = (await fn.has(denops, "nvim"))
    ? "~/.config/nvim/plugin/dvpm_plugin_cache.vim"
    : "~/.config/vim/plugin/dvpm_plugin_cache.vim";
  // This cache path must be pre-appended to the runtimepath.
  // Add it in vimrc or init.lua by yourself, or specify the path originally added to
  // runtimepath of Vim / Neovim.
  const cache = ensure(await fn.expand(denops, cache_path), is.String);

  // Specify `cache` to Dvpm.begin.
  const dvpm = await Dvpm.begin(denops, { base, cache });

  await dvpm.add({
    url: "tani/vim-artemis",
    // Just set `cache.enabled` to true if you don't need plugin settings.
    cache: { enabled: true },
  });
  await dvpm.add({
    url: "nvim-lua/plenary.nvim",
    cache: { enabled: true },
    enabled: async ({ denops }) => await fn.has(denops, "nvim"),
  });

  await dvpm.add({
    url: "startup-nvim/startup.nvim",
    // deno-lint-ignore require-await
    enabled: async ({ denops }) => denops.meta.host === "nvim",
    // Specify `before` or `after` if you need to configure the plugin.
    // `before` is executed before the plugin is added to the runtimepath.
    // `after` runs after the plugin is added to the runtimepath.
    cache: {
      before: `echomsg "Load startup !"`,
      after: `
        lua require("startup").setup({ theme = "startify" })
      `,
    },
  });

  await dvpm.add({
    url: "rcarriga/nvim-notify",
    enabled: async ({ denops }) => await fn.has(denops, "nvim"),
    cache: {
      // `before` and `after` can be set independently.
      after: `
        lua << EOB
          require("notify").setup({
            stages = "slide",
          })
          vim.notify = require("notify")
        EOB
      `,
      // If you want to read it in a separate file, specify as follows. (.lua and .vim can be specified)
      // afterFile: "~/.config/nvim/rc/after/notify.lua",
    },
  });

  // Finally, call Dvpm.end.
  await dvpm.end();
};
```

After performing the above settings, when you start Vim / Neovim, the following should be output to
the file specified as `cache` in `Dvpm.begin`. And the next time Vim / Neovim starts, the plugin
will be enabled before `VimEnter`.

- `~/.config/nvim/plugin/dvpm_plugin_cache.vim` (for Neovim)

```
" This file is generated by dvpm.
set runtimepath+=/Users/yukimemi/.cache/nvim/dvpm/github.com/tani/vim-artemis
set runtimepath+=/Users/yukimemi/.cache/nvim/dvpm/github.com/nvim-lua/plenary.nvim
echomsg "Load startup !"
set runtimepath+=/Users/yukimemi/.cache/nvim/dvpm/github.com/startup-nvim/startup.nvim
lua require("startup").setup({theme = "startify"})
set runtimepath+=/Users/yukimemi/.cache/nvim/dvpm/github.com/rcarriga/nvim-notify
lua << EOB
require("notify").setup({
stages = "slide",
})
vim.notify = require("notify")
EOB
```

## Autocmd

- DvpmCacheUpdated

Fires after updating the cache.

e.g.

```typescript
import * as autocmd from "@denops/std/autocmd";

~~~

await autocmd.define(denops, "User", "DvpmCacheUpdated", "echo 'dvpm cache updated !'");
```

## Profile setting

If `profiles` is specified in `DvpmOption`, the plugins to be enabled can be restricted by the specified profile.

e.g.

```typescript
~~~
export const main: Entrypoint = async (denops: Denops) => {
  const base_path = (await fn.has(denops, "nvim")) ? "~/.cache/nvim/dvpm" : "~/.cache/vim/dvpm";
  const base = ensure(await fn.expand(denops, base_path), is.String);

  const dvpm = await Dvpm.begin(denops, {
    base,
    // Use only minimal plugins
    profiles: ["minimal"],
  });

  await dvpm.add({
    url: "yukimemi/chronicle.vim",
    profiles: ["minimal"],
  });
  await dvpm.add({
    url: "yukimemi/silentsaver.vim",
    profiles: ["default"],
  });
  await dvpm.add({
    url: "yukimemi/autocursor.vim",
    profiles: ["full"],
  });

  await dvpm.end();
};
```

In this case, only `yukimemi/chronicle.vim` is enabled.

e.g.

```typescript
~~~
export const main: Entrypoint = async (denops: Denops) => {
  const base_path = (await fn.has(denops, "nvim")) ? "~/.cache/nvim/dvpm" : "~/.cache/vim/dvpm";
  const base = ensure(await fn.expand(denops, base_path), is.String);

  const dvpm = await Dvpm.begin(denops, {
    base,
    // Use only minimal and default plugins
    profiles: ["minimal", "default"],
  });

  await dvpm.add({
    url: "yukimemi/chronicle.vim",
    profiles: ["minimal"],
  });
  await dvpm.add({
    url: "yukimemi/silentsaver.vim",
    profiles: ["default"],
  });
  await dvpm.add({
    url: "yukimemi/autocursor.vim",
    profiles: ["full"],
  });

  await dvpm.end();
};
```

In this case, `yukimemi/chronicle.vim` and `yukimemi/silentsaver.vim` are enabled.

If you specify `["minimal", "default", "full"]` in `DvpmOption.profiles`, all three plugins will be enabled.
