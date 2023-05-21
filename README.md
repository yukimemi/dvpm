# dvpm - Denops Vim/Neovim Plugin Manager

`dvpm` is a plugin manager for Vim and Neovim, powered by [denops.vim](https://github.com/vim-denops/denops.vim).

- Vim / Neovim starts up very fast !

...but plugins are not loaded yet at startup ＼(^o^)／

All plugins are loaded lazily.

- You can write all Vim / Neovim settings in typescript

## Requirement

- [Deno - A modern runtime for JavaScript and TypeScript](https://deno.land/)

## Sample configuration

- ~/.config/nvim/init.lua (Neovim)

```lua
local denops = vim.fn.expand("~/.cache/nvim/dvpm/github.com/vim-denops/denops.vim")
if not vim.loop.fs_stat(denops) then
  vim.fn.system({ "git", "clone", "https://github.com/vim-denops/denops.vim", denops })
end
vim.opt.runtimepath:prepend(denops)
```
- ~/.vimrc (Vim)

```vim
let s:denops = expand("~/.cache/vim/dvpm/github.com/vim-denops/denops.vim")
if !isdirectory(s:denops)
  execute 'silent! !git clone https://github.com/vim-denops/denops.vim ' .. s:denops
endif
execute 'set runtimepath^=' . substitute(fnamemodify(s:denops, ':p') , '[/\\]$', '', '')
```

- ~/.config/nvim/denops/config/main.ts (Neovim)
- ~/.config/vim/denops/config/main.ts (Vim)

```typescript
import { Denops } from "https://deno.land/x/denops_std@v4.3.3/mod.ts";
import * as mapping from "https://deno.land/x/denops_std@v4.3.3/mapping/mod.ts";
import { globals } from "https://deno.land/x/denops_std@v4.3.3/variable/mod.ts";
import { expand, has } from "https://deno.land/x/denops_std@v4.3.3/function/mod.ts";
import { ensureString } from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";
import { echo, execute } from "https://deno.land/x/denops_std@v4.3.3/helper/mod.ts";

import { Dvpm } from "https://deno.land/x/dvpm@0.3.0/mod.ts";

export async function main(denops: Denops): Promise<void> {
  const base_path = (await has(denops, "nvim"))
    ? "~/.cache/nvim/dvpm"
    : "~/.cache/vim/dvpm";
  const base = ensureString(await expand(denops, base_path));
  // First, call Dvpm.begin with denops object and base path.
  const dvpm = await Dvpm.begin(denops, { base });

  // URL only.
  await dvpm.add({ url: "yukimemi/dps-autocursor" });
  // With branch.
  await dvpm.add({ url: "neoclide/coc.nvim", branch: "release" });
  // before setting.
  await dvpm.add({
    url: "yukimemi/dps-autobackup",
    before: async (denops: Denops) => {
      await globals.set(
        denops,
        "autobackup_dir",
        ensureString(await expand(denops, "~/.cache/nvim/autobackup")),
      );
    },
  });
  // after setting.
  await dvpm.add({
    url: "folke/which-key.nvim",
    after: async (denops: Denops) => {
      await execute(denops, `lua require("which-key").setup()`);
    },
  });
  // dst setting. (for develop)
  await dvpm.add({
    url: "yukimemi/dps-randomcolorscheme",
    dst: "~/src/github.com/yukimemi/dps-randomcolorscheme",
    before: async (denops: Denops) => {
      await mapping.map(denops, "<space>ro", "<cmd>ChangeColorscheme<cr>", { mode: "n" });
      await mapping.map(denops, "<space>rd", "<cmd>DisableThisColorscheme<cr>", { mode: "n" });
      await mapping.map(denops, "<space>rl", "<cmd>LikeThisColorscheme<cr>", { mode: "n" });
      await mapping.map(denops, "<space>rh", "<cmd>HateThisColorscheme<cr>", { mode: "n" });
    },
  });
  // Disable setting.
  await dvpm.add({
    url: "yukimemi/dps-hitori",
    enabled: false,
  });
  // Disable with function.
  await dvpm.add({
    url: "editorconfig/editorconfig-vim",
    enabled: async (denops: Denops) => !(await has(denops, "nvim")),
  });
  // With dependencies.
  await dvpm.add({
    url: "lambdalisue/gin.vim",
    dependencies: [
      { url: "lambdalisue/askpass.vim" },
      { url: "lambdalisue/guise.vim" },
    ],
  });

  // Finally, call Dvpm.end.
  await dvpm.end();

  await echo(denops, "Load completed !");
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
  // debug print. Default is false.
  debug?: boolean;
  // Number of concurrent processes. Default is 8.
  // This is used plugin install, update, source.
  concurrency?: number;
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
  // Github `username/repository`. Other URLs starting with https are todo.
  url: string;
  // The path to git clone. (Option)
  dst?: string;
  // Git branch name. (Option)
  branch?: string;
  // enable or disable. Default is true.
  enabled?: boolean | ((denops: Denops) => Promise<boolean>);
  // Processing to be performed before adding runtimepath. (Option)
  before?: (denops: Denops) => Promise<void>;
  // Processing to be performed after adding runtimepath. (Option)
  after?: (denops: Denops) => Promise<void>;
  // dependencies.
  dependencies?: Plug[];
};
```

## Command

```vim
:DvpmUpdate [url]
```

Update installed plugins.

If url is specified, update only target plugins,
if not specified, update all plugins.


