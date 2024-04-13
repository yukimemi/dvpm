# dvpm - Denops Vim/Neovim Plugin Manager ![dvpm](https://shield.deno.dev/x/dvpm)

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
import * as fn from "https://deno.land/x/denops_std@v5.2.0/function/mod.ts";
import * as mapping from "https://deno.land/x/denops_std@v5.2.0/mapping/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.2.0/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.11.0/mod.ts";
import { execute } from "https://deno.land/x/denops_std@v5.2.0/helper/mod.ts";
import { globals } from "https://deno.land/x/denops_std@v5.2.0/variable/mod.ts";

import { Dvpm } from "https://deno.land/x/dvpm@$MODULE_VERSION/mod.ts";

export async function main(denops: Denops): Promise<void> {
  const base_path = (await fn.has(denops, "nvim"))
    ? "~/.cache/nvim/dvpm"
    : "~/.cache/vim/dvpm";
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
      await globals.set(
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
  // With dependencies.
  await dvpm.add({
    url: "lambdalisue/gin.vim",
    dependencies: [
      { url: "lambdalisue/askpass.vim" },
      { url: "lambdalisue/guise.vim" },
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
}
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
  // Number of concurrent processes. Default is 8.
  // This is used plugin install, update, source.
  concurrency?: number;
  // When this option is set, the time taken to source each plugin is output to dvpm://profile buffer after Vim is launched.
  // `before` and `after` execution times are not included. Default is false.
  profile?: boolean;
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

source `after/*.(vim|lua)` files.

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
  // Git branch name. (Option)
  branch?: string;
  // clone depth. (Option)
  depth?: number;
  // enable or disable. Default is true.
  enabled?: TrueFalse;
  // Processing to be performed before adding runtimepath. (Option)
  before?: ({
    denops,
    info,
  }: {
    denops: Denops;
    info: PlugInfo;
  }) => Promise<void>;
  // Processing to be performed before source plugin/*.vim and plugin/*.lua. (Option)
  beforeSource?: ({
    denops,
    info,
  }: {
    denops: Denops;
    info: PlugInfo;
  }) => Promise<void>;
  // Processing to be performed after adding runtimepath. (Option)
  after?: ({
    denops,
    info,
  }: {
    denops: Denops;
    info: PlugInfo;
  }) => Promise<void>;
  // File path of processing to be performed before adding runtimepath. (Option)
  beforeFile?: string;
  // File path of processing to be performed before source plugin/*.vim and plugin/*.lua. (Option)
  beforeSourceFile?: string;
  // File path of processing to be performed after adding runtimepath. (Option)
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
    enabled?: TrueFalse;
    before?: string;
    after?: string;
    beforeFile?: string;
    afterFile?: string;
  };
  // Whether to git clone and update. Default is true. (Option)
  // If this option is set to false, then `enabled` is also set to false.
  clone?: TrueFalse;
  // dependencies. (Option)
  dependencies?: Plug[];
};
```

```typescript
export type TrueFalse =
  | boolean
  | (({
      denops,
      info,
    }: {
      denops: Denops;
      info: PlugInfo;
    }) => Promise<boolean>);
```

```typescript
export type PlugInfo = Plug & {
  // `true` if added to runtimepath.
  isLoad: boolean;
  // `true` if install or update.
  isUpdate: boolean;
  // `true` if cache is enabled.
  isCache: boolean;
  // plugin load time. Need to set DvpmOption.profile.
  elaps: number;
};
```

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
value is `Plugin[]`. See the [doc](https://deno.land/x/dvpm/mod.ts?s=Plugin) for type information.

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
export async function main(denops: Denops): Promise<void> {
  const base_path = (await fn.has(denops, "nvim"))
    ? "~/.cache/nvim/dvpm"
    : "~/.cache/vim/dvpm";
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
    enabled: async ({ denops }) => await fn.has(denops, "nvim"),
    // Specify `before` or `after` if you need to configure the plugin.
    // `before` is executed before the plugin is added to the runtimepath.
    // `after` runs after the plugin is added to the runtimepath.
    cache: {
      before: `echomsg "Load startup !"`,
      after: `
        lua require("startup").setup({theme = "startify"})
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
}
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
