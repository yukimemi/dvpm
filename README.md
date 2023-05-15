# dvpm - Denops Vim/Neovim Plugin Manager

`dvpm` is a plugin manager for Vim and Neovim, powered by [denops.vim](https://github.com/vim-denops/denops.vim).
All Vim and Neovim configuration files can be described in typescript.

## Sample configuration

### Neovim

- ~/.config/nvim/init.lua

```lua
local denops = vim.fn.expand("~/.cache/nvim/dvpm/github.com/vim-denops/denops.vim")
if not vim.loop.fs_stat(denops) then
  vim.fn.system({ "git", "clone", "https://github.com/vim-denops/denops.vim", denops })
end
vim.opt.runtimepath:prepend(denops)
```

- ~/.config/nvim/denops/config/main.ts

```typescript
import { Denops } from "https://deno.land/x/denops_std@v4.3.1/mod.ts";
import * as mapping from "https://deno.land/x/denops_std@v4.3.1/mapping/mod.ts";
import { globals } from "https://deno.land/x/denops_std@v4.3.1/variable/mod.ts";
import { expand } from "https://deno.land/x/denops_std@v4.3.1/function/mod.ts";
import { ensureString } from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";
import {
  echo,
  execute,
} from "https://deno.land/x/denops_std@v4.3.1/helper/mod.ts";

import { Dvpm } from "https://deno.land/x/dvpm@0.0.7/dvpm.ts";

export async function main(denops: Denops): Promise<void> {

  const base = ensureString(await expand(denops, "~/.cache/nvim/dvpm"));
  const dvpm = await Dvpm.create(denops, { base });

  // URL only.
  await dvpm.add({ url: "yukimemi/dps-autocursor" });
  // With branch.
  await dvpm.add({ url: "neoclide/coc.nvim", branch: "release" });
  // before setting.
  await dvpm.add({
    url: "yukimemi/dps-autobackup",
    before: async (denops: Denops) => {
      await globals.set(denops, "autobackup_dir", ensureString(await expand(denops, "~/.cache/nvim/autobackup")));
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
  })

  await echo(denops, "Load completed !");
}
```

See my dotfiles for more complex examples.

[dotfiles/.config/nvim at main · yukimemi/dotfiles · GitHub](https://github.com/yukimemi/dotfiles/tree/main/.config/nvim)


### Vim

TODO.

## API

### Dvpm.create

```typescript
public static async create(denops: Denops, dvpmOption: DvpmOption): Promise<Dvpm>
```

```typescript
export type DvpmOption = {
  // Base path for git clone.
  base: string;
  // debug print. Default is false.
  debug?: boolean;
  // Number of concurrent Update processes (DvpmUpdate). Default is 8.
  concurrency?: number;
};

```

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
  enabled?: boolean;
  // Processing to be performed before adding runtimepath. (Option)
  before?: (denops: Denops) => Promise<void>;
  // Processing to be performed after adding runtimepath. (Option)
  after?: (denops: Denops) => Promise<void>;
};
```

## Command

- DvpmUpdate [url]

Update installed plugins.

If url is specified, update only target plugins,
if not specified, update all plugins.


