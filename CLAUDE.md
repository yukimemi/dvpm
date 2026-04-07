# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`dvpm` is a Vim/Neovim plugin manager built on [denops.vim](https://github.com/vim-denops/denops.vim). It runs as a Deno TypeScript process that communicates with Vim/Neovim over an RPC bridge. Users write their entire Vim configuration in TypeScript (`main.ts`), calling dvpm APIs to declare plugins and hooks. dvpm handles installation, lazy loading, and lifecycle hooks.

## Pull requests

Write PR titles and bodies in English.

## Commands

```sh
deno task check    # type-check all source files
deno task lint     # lint
deno task fmt      # format (--check to verify only)
deno task test     # run tests (clones denops.vim into .test_cache/ if needed)
deno task ci       # check + lint + fmt --check + publish dry-run + test
```

Run a specific test file:
```sh
deno run -A scripts/test_runner.ts tests/lazy_keys_test.ts
```

On this machine, Vim is not available locally — only Neovim tests run. Set `DENOPS_TEST_VIM_EXECUTABLE=""` to suppress vim-related spawn errors when running tests manually.

## Release process (from GEMINI.md)

1. `deno task ci`
2. Bump `version` in `deno.json`
3. Commit → push to main
4. `git tag <version>` → `git push origin <version>` (no `v` prefix, e.g. `11.0.1` not `v11.0.1`)
5. GHA automatically runs `deno publish` when a version tag is pushed

## Architecture

### Key files

| File | Role |
|------|------|
| `dvpm.ts` | Main `Dvpm` class — `begin()`, `add()`, `end()`, `load()`, lazy-trigger wiring |
| `plugin.ts` | `Plugin` class — per-plugin install / update / source logic |
| `types.ts` | All public types and arktype schemas (`Plug`, `LazyParams`, `KeyMap`, …) |
| `util.ts` | Pure helpers: `convertUrl`, `parseUrl`, `buildExecuteCmd`, `cache`, `notify` |
| `git.ts` | Git operations (clone, pull, rev) wrapped around `Deno.Command` |
| `mod.ts` | Public re-export surface (JSR package entry point) |
| `logger.ts` | Thin wrapper around `@std/log` |

### Lifecycle

```
Dvpm.begin(denops, option)
  └─ registers Denops dispatcher (load, update, checkHealth, …)
  └─ defines VimScript helpers: Dvpm_Internal_Load_*, DvpmUpdate, DvpmList, …

dvpm.add({ url, lazy, before, after, … })   ← declares a plugin

dvpm.end()
  └─ installs missing plugins (git clone) in parallel
  └─ sets up lazy-trigger proxies (fire()) for cmd/keys/ft/event/colorscheme
  └─ immediately loads non-lazy plugins (loadPlugins())
```

### Lazy loading — how proxy mappings work

When a plugin declares `lazy.keys`, dvpm creates proxy mappings before the real plugin is loaded:

- **`mode: "n"`** → `nnoremap lhs <cmd>call denops#notify('load', [url, 'keys', lhs])<CR>`  
  Triggers an async load; feedkeys replays the key after loading.

- **Other modes (x, o, v, …)** → `xnoremap lhs <expr> Dvpm_Internal_Load_*(url, lhs)`  
  This is a synchronous expr mapping. `Dvpm_Internal_Load_*` calls `denops#request('load', [url, 'keys', lhs, {is_expr: true}])` which **returns the real rhs string** for Vim to execute directly.

The `is_expr` path in `Dvpm.load()` detects the current Vim mode (`mode()`), finds the mode-matching explicit `rhs` from the config, then falls back to reading the now-real mapping from Vim, and finally falls back to `feedkeys` for Lua-callback mappings (empty rhs).

### Concurrency

- Plugin installs and loads use `Semaphore` from `@core/asyncutil` (configurable via `option.concurrency`).
- `Plugin.mutex` (a single-slot `Semaphore`) serializes runtimepath mutations.
- `Dvpm.#loading` (a `Set`) prevents double-loading a plugin.

### Profiles

Plugins can be tagged with `profiles: ["core", "work"]`. Dvpm reads the active profile from `g:dvpm_profile` and skips plugins whose `profiles` array does not include it.

### Cache

`cache.enabled` on a plugin causes dvpm to write a Vim/Lua script (via `util.cache()`) that replays `before`/`after`/`beforeFile`/`afterFile` content, skipping the Deno roundtrip on subsequent startups.

### Runtime events (User autocmds emitted by dvpm)

- `DvpmBeginPre` / `DvpmBeginPost`
- `DvpmPluginLoadPre:<name>` / `DvpmPluginLoadPost:<name>`
- `DvpmCacheUpdated`

### Testing

Tests use `@denops/test` (`test({ mode: "all", … })`), which spawns real Vim/Neovim processes against a cloned `denops.vim`. Each test:
1. Creates a temp dir as the plugin base.
2. Stubs `plugin.install`, `plugin.update`, `plugin.build` to no-ops.
3. Calls `dvpm.end()` to wire up lazy triggers.
4. Exercises the trigger (e.g., `dvpm.load(url, "keys", lhs, { is_expr: true })`).
5. Asserts Vim global variables or mapping state.
