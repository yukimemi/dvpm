# dvpm - Denops Vim/Neovim Plugin Manager !

[![DeepWiki](https://img.shields.io/badge/DeepWiki-yukimemi%2Fdvpm-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/yukimemi/dvpm)

`dvpm` is a plugin manager for Vim and Neovim, powered by
[denops.vim](https://github.com/vim-denops/denops.vim).

- Vim / Neovim start up very fast (all plugins are loaded lazily)!

<div align="center">
  <img src="https://raw.githubusercontent.com/yukimemi/files/main/dvpm/startuptime.png" title="startuptime" />
</div>

- You can write all Vim / Neovim settings in TypeScript

## Requirement

- [Deno - A modern runtime for JavaScript and TypeScript](https://deno.land/)

## Setup

### 1. Bootstrap denops.vim

<details>
<summary>Neovim (<code>~/.config/nvim/init.lua</code> or <code>~/AppData/Local/nvim/init.lua</code>)</summary>

```lua
local denops = vim.fn.expand("~/.cache/nvim/dvpm/github.com/vim-denops/denops.vim")
if not vim.loop.fs_stat(denops) then
  vim.fn.system({ "git", "clone", "https://github.com/vim-denops/denops.vim", denops })
end
vim.opt.runtimepath:prepend(denops)
```

</details>

<details>
<summary>Vim (<code>~/.vimrc</code> or <code>~/_vimrc</code>)</summary>

```vim
let s:denops = expand("~/.cache/vim/dvpm/github.com/vim-denops/denops.vim")
if !isdirectory(s:denops)
  execute 'silent! !git clone https://github.com/vim-denops/denops.vim ' .. s:denops
endif
execute 'set runtimepath^=' . substitute(fnamemodify(s:denops, ':p') , '[/\\]$', '', '')
```

</details>

### 2. Configure deno.json

If you use denops.vim v8 or later, specify `workspace` and add dependencies.

Place `deno.json` at:
- `~/.config/nvim/deno.json` (Neovim, Mac/Linux)
- `~/AppData/Local/nvim/deno.json` (Neovim, Windows)
- `~/.vim/deno.json` (Vim, Mac/Linux)
- `~/vimfiles/deno.json` (Vim, Windows)

```json
{
  "workspace": ["./denops/config"]
}
```

```bash
cd ./denops/config
deno add jsr:@denops/std jsr:@yukimemi/dvpm
```

### 3. Write main.ts

Place at `~/.config/nvim/denops/config/main.ts` (Neovim) or `~/.vim/denops/config/main.ts` (Vim):

<details>
<summary>Example <code>main.ts</code></summary>

```typescript
import type { Denops, Entrypoint } from "@denops/std";
import * as fn from "@denops/std/function";
import * as vars from "@denops/std/variable";
import { execute } from "@denops/std/helper";
import { Dvpm } from "@yukimemi/dvpm";

export const main: Entrypoint = async (denops: Denops) => {
  const base_path = (await fn.has(denops, "nvim")) ? "~/.cache/nvim/dvpm" : "~/.cache/vim/dvpm";
  const base = (await fn.expand(denops, base_path)) as string;

  const dvpm = await Dvpm.begin(denops, { base });

  // GitHub shorthand or full URL
  await dvpm.add({ url: "yukimemi/autocursor.vim" });
  await dvpm.add({ url: "https://notgithub.com/some/other/plugin" });

  // With branch/rev
  await dvpm.add({ url: "neoclide/coc.nvim", rev: "release" });

  // rev as async function (switch by Neovim version)
  await dvpm.add({
    url: "neoclide/coc.nvim",
    rev: async ({ denops }) =>
      (await fn.has(denops, "nvim-0.11")) ? "master" : "release",
  });

  // dst as async function (integrate with vim.pack install path)
  await dvpm.add({
    url: "vim-denops/denops.vim",
    dst: async ({ denops }) => {
      const data = await fn.stdpath(denops, "data") as string;
      return `${data}/site/pack/core/opt/denops.vim`;
    },
  });

  // beforeFile as async function (dynamic path using stdpath)
  await dvpm.add({
    url: "rcarriga/nvim-notify",
    beforeFile: async ({ denops }) => {
      const config = await fn.stdpath(denops, "config") as string;
      return `${config}/rc/before/nvim-notify.lua`;
    },
  });

  // Execute at startup (regardless of lazy loading)
  await dvpm.add({
    url: "thinca/vim-quickrun",
    lazy: { keys: { lhs: "<leader>r", rhs: "<cmd>QuickRun<cr>" } },
    init: async ({ denops }) => {
      await vars.g.set(denops, "quickrun_no_default_key_mappings", 1);
    },
  });

  // Run before/after sourcing
  await dvpm.add({
    url: "folke/which-key.nvim",
    after: async ({ denops }) => {
      await execute(denops, `lua require("which-key").setup()`);
    },
  });

  // Load from file
  await dvpm.add({
    url: "rcarriga/nvim-notify",
    beforeFile: "~/.config/nvim/rc/before/nvim-notify.lua",
    afterFile: "~/.config/nvim/rc/after/nvim-notify.lua",
  });

  // Disable a plugin
  await dvpm.add({ url: "yukimemi/hitori.vim", enabled: false });

  // Disable conditionally
  await dvpm.add({
    url: "editorconfig/editorconfig-vim",
    enabled: async ({ denops }) => !(await fn.has(denops, "nvim")),
  });

  // With dependencies
  await dvpm.add({ url: "lambdalisue/askpass.vim" });
  await dvpm.add({ url: "lambdalisue/guise.vim" });
  await dvpm.add({
    url: "lambdalisue/gin.vim",
    dependencies: ["lambdalisue/askpass.vim", "lambdalisue/guise.vim"],
  });

  await dvpm.end();
};
```

</details>

See [dotfiles](https://github.com/yukimemi/dotfiles/tree/main/dot_config/nvim) for more complex examples.

## API

### Dvpm.begin

```typescript
public static async begin(denops: Denops, dvpmOption: DvpmOption): Promise<Dvpm>
```

<details>
<summary><code>DvpmOption</code> type</summary>

```typescript
export type DvpmOption = {
  base: string;          // Base path for git clone.
  cache?: string;        // Cache file path. See `Cache setting`.
  profiles?: string[];   // Active profiles. See `Profile setting`.
  concurrency?: number;  // Concurrent processes. Default: 8.
  notify?: boolean;      // Use vim.notify for logs. Default: false. (Neovim only)
  logarg?: string[];     // git log args for :DvpmUpdate output. Default: [].
  health?: boolean;      // Enable :checkhealth support. Default: false. (Neovim only)
  profile?: boolean;     // Enable performance profiling. Default: false. See :DvpmProfile.
  clean?: Bool;          // Clean local changes before update. Default: false.
};
```

</details>

### Dvpm.end

```typescript
public async end(): Promise<void>
```

Adds plugins to runtimepath and sources `plugin/*.vim` and `plugin/*.lua`.

### Dvpm.add

```typescript
public async add(plug: Plug): Promise<void>
```

<details>
<summary><code>Plug</code> / <code>Lazy</code> / <code>KeyMap</code> / <code>Bool</code> types</summary>

```typescript
export type Plug = {
  url: string;           // GitHub `username/repo` or full git URL.
  name?: string;         // Plugin name (auto-calculated if omitted).
  dst?: Str;             // Custom clone path. Supports async function (info has `url` resolved).
  rev?: Str;             // Git branch or revision. Supports async function (info has `url`, `dst`, `name` resolved).
  depth?: number;        // Clone depth (shallow clone).
  enabled?: Bool;        // Enable/disable. Default: true.
  profiles?: string[];   // Enable only when DvpmOption.profiles includes one of these.
  clone?: Bool;          // Whether to git clone/update. Defaults to true when enabled, false when disabled.
  clean?: Bool;          // Clean local changes before update. Default: false.
  dependencies?: string[]; // Plugin URLs that must be loaded first.
  init?: ({ denops, info }) => Promise<void>;       // Run at startup before runtimepath is set (always, ignores lazy).
  before?: ({ denops, info }) => Promise<void>;     // Run after the plugin is added to runtimepath, before sourcing plugin/*.vim.
  after?: ({ denops, info }) => Promise<void>;      // Run after the plugin is added to runtimepath and sourcing plugin/*.vim.
  initFile?: Str;        // Vim/Lua file to source at startup before runtimepath is set (always, ignores lazy). Supports async function.
  beforeFile?: Str;      // File to source after the plugin is added to runtimepath, before sourcing plugin/*.vim. Supports async function.
  afterFile?: Str;       // File to source after the plugin is added to runtimepath and sourcing plugin/*.vim. Supports async function.
  build?: ({ denops, info }) => Promise<void>;      // Run after install or update (even if no changes). Check info.isInstalled / info.isUpdated.
  cache?: {
    enabled?: Bool;
    before?: string;
    after?: string;
    beforeFile?: Str;    // Supports async function.
    afterFile?: Str;     // Supports async function.
  };
  lazy?: Lazy;
};

export type Lazy = {
  enabled?: Bool;                              // Default: false.
  cmd?: string | Command | (string | Command)[];
  event?: string | string[];
  ft?: string | string[];
  keys?: string | string[] | KeyMap | KeyMap[];
  colorscheme?: string | string[];
};

export type Command = {
  name: string;
  complete?: string;  // Default: "file".
};

export type KeyMap = {
  lhs: string;
  rhs?: string;              // If omitted, proxy mapping is unmapped after loading.
  mode?: string | string[];  // Default: "n".
  noremap?: boolean;         // Default: true.
  silent?: boolean;          // Default: true.
  nowait?: boolean;          // Default: false.
  expr?: boolean;            // Default: false.
  desc?: string;
};

export type Bool =
  | boolean
  | (({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<boolean>);

export type Str =
  | string
  | (({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<string>);
```

`PlugInfo` is similar to `Plug` but with all values resolved (e.g. `enabled` is always a `boolean`).
It also has the following read-only status fields available in callbacks:

| Field | Type | Description |
|---|---|---|
| `isLoaded` | `boolean` | Whether the plugin has been added to runtimepath in this session |
| `isInstalled` | `boolean` | Whether the plugin was cloned (first install) in this session |
| `isUpdated` | `boolean` | Whether the plugin was updated (git pull) in this session |
| `isCache` | `boolean` | Whether the plugin is loaded via cache |
| `elaps` | `number` | Elapsed time for loading (ms) |

> **Note:** `build` is called after every update even if nothing changed, so always check `info.isInstalled || info.isUpdated` before running heavy build steps.

</details>

### Dvpm.cache

```typescript
public async cache(arg: { script: string; path: string }): Promise<boolean>
```

Cache a script to a file. Returns `true` if the cache was written. Useful for writing startup-time Vim/Lua snippets.

### Dvpm.list

```typescript
public list(): Plugin[]
```

Returns the list of all registered plugins.

## Commands

```vim
:DvpmUpdate [url]     " Update all plugins, or only the specified one.
:DvpmList             " Show plugin list in dvpm://list buffer.
:checkhealth dvpm     " Health check. (Neovim only, requires health: true)
:DvpmCheckHealth      " Health check in dvpm://checkhealth buffer. (Vim / Neovim)
:DvpmProfile          " Show plugin performance profile. (requires profile: true)
```


`:DvpmProfile` requires `profile: true` in `Dvpm.begin`. Each row shows time per loading phase:

| column   | description |
|---|---|
| `total`  | Total time charged to this plugin |
| `init`   | Time in the `init` / `initFile` hook |
| `before` | Time in the `before` / `beforeFile` hook |
| `load`   | runtimepath + source + denops plugin loading |
| `after`  | Time in the `after` / `afterFile` hook |
| `build`  | Time in the `build` hook (first install only) |


## Cache setting

Enable `cache` to load plugins before `VimEnter` (faster startup).

<details>
<summary>Example</summary>

```typescript
const cache = (await fn.expand(
  denops,
  (await fn.has(denops, "nvim"))
    ? "~/.config/nvim/plugin/dvpm_plugin_cache.vim"
    : "~/.vim/plugin/dvpm_plugin_cache.vim",  // ~/vimfiles/plugin/dvpm_plugin_cache.vim on Windows
)) as string;

const dvpm = await Dvpm.begin(denops, { base, cache });

// Simple: just set cache.enabled
await dvpm.add({ url: "tani/vim-artemis", cache: { enabled: true } });

// With before/after scripts
await dvpm.add({
  url: "rcarriga/nvim-notify",
  enabled: async ({ denops }) => await fn.has(denops, "nvim"),
  cache: {
    after: `
      lua << EOB
        require("notify").setup({ stages = "slide" })
        vim.notify = require("notify")
      EOB
    `,
    // Or use a separate file:
    // afterFile: "~/.config/nvim/rc/after/notify.lua",
  },
});
```

</details>

The cache file is auto-generated on first run and loaded on subsequent starts.

## Lazy Loading

All plugins managed by `dvpm` are inherently lazy (loaded after `denops.vim` itself). Explicit `lazy` settings are useful to keep `runtimepath` short and load plugins only when needed.

**Important:** Since `dvpm` starts after Vim's initial startup, early triggers may be missed. For example, `ft: "html"` will not fire if you open an HTML file directly from the command line.

<details>
<summary>Examples</summary>

```typescript
// Load on command
await dvpm.add({ url: "lambdalisue/gin.vim", lazy: { cmd: "Gin" } });

// Load on event
await dvpm.add({ url: "tweekmonster/startuptime.vim", lazy: { event: "VimEnter" } });

// Load on filetype
await dvpm.add({ url: "othree/html5.vim", lazy: { ft: "html" } });

// Load on colorscheme
await dvpm.add({ url: "folke/tokyonight.nvim", lazy: { colorscheme: "tokyonight" } });

// Load on keymap
await dvpm.add({
  url: "mbbill/undotree",
  lazy: { keys: { lhs: "<leader>u", rhs: "<cmd>UndotreeToggle<cr>" } },
});

// Load on keys (unmap proxy after load — useful for text objects / operator plugins)
await dvpm.add({ url: "kana/vim-textobj-user" });
await dvpm.add({
  url: "kana/vim-textobj-entire",
  dependencies: ["kana/vim-textobj-user"],
  lazy: {
    keys: [
      { lhs: "ie", mode: ["x", "o"] },
      { lhs: "ae", mode: ["x", "o"] },
    ],
  },
});

// Library plugin (lazy, loaded when a dependent plugin is triggered)
await dvpm.add({ url: "nvim-lua/plenary.nvim", lazy: { enabled: true } });
await dvpm.add({
  url: "nvim-telescope/telescope.nvim",
  lazy: { cmd: "Telescope" },
  dependencies: ["nvim-lua/plenary.nvim"],
});

// Manual load in init hook
await dvpm.add({
  url: "junegunn/fzf.vim",
  lazy: { enabled: true },
  init: async ({ denops }) => {
    if (Deno.env.get("ENABLE_FZF")) {
      await dvpm.load("junegunn/fzf.vim");
    }
  },
});
```

</details>

### Hook execution order

1. `init` / `initFile` — always at startup (`Dvpm.end()`), before runtimepath is set (ignores lazy)
2. `before` / `beforeFile` — after the plugin is added to `runtimepath`, before sourcing `plugin/*.vim`
3. `after` / `afterFile` — after the plugin is added to `runtimepath` and sourcing `plugin/*.vim`
4. `build` — after install or update

## Autocmd

<details>
<summary>Available autocmd events</summary>

### Lifecycle

- `DvpmBeginPre` / `DvpmBeginPost`
- `DvpmEndPre` / `DvpmEndPost`
- `DvpmInstallPre` / `DvpmInstallPost`
- `DvpmUpdatePre` / `DvpmUpdatePost`
- `DvpmCacheUpdated`

### Per-plugin

- `DvpmPluginLoadPre:{pluginName}` / `DvpmPluginLoadPost:{pluginName}`
- `DvpmPluginInstallPre:{pluginName}` / `DvpmPluginInstallPost:{pluginName}`
- `DvpmPluginUpdatePre:{pluginName}` / `DvpmPluginUpdatePost:{pluginName}`

`{pluginName}` is the `name` property of `PlugInfo`. Wildcards are supported.

</details>

```typescript
import * as autocmd from "@denops/std/autocmd";

await autocmd.define(denops, "User", "DvpmCacheUpdated", "echo 'dvpm cache updated !'");

await autocmd.define(
  denops,
  "User",
  "DvpmPluginLoadPost:*",
  `echom "Loaded: " . substitute(expand("<amatch>"), "^DvpmPluginLoadPost:", "", "")`,
);
```

## Profile setting

Restrict which plugins are enabled via profiles:

```typescript
const dvpm = await Dvpm.begin(denops, {
  base,
  profiles: ["minimal", "default"], // only these profiles are active
});

await dvpm.add({ url: "yukimemi/chronicle.vim", profiles: ["minimal"] });   // enabled
await dvpm.add({ url: "yukimemi/silentsaver.vim", profiles: ["default"] }); // enabled
await dvpm.add({ url: "yukimemi/autocursor.vim", profiles: ["full"] });     // disabled
```

A plugin is enabled if any of its `profiles` entries match the active profiles.
If `profiles` is not set on a plugin, it is always enabled.

## Debug logging

`dvpm` uses [@std/log](https://jsr.io/@std/log) for logging:

```typescript
import { setup, handlers } from "@std/log";

setup({
  handlers: { console: new handlers.ConsoleHandler("DEBUG") },
  loggers: { dvpm: { level: "DEBUG", handlers: ["console"] } },
});
```
