// =============================================================================
// File        : types.ts
// Author      : yukimemi
// Last Change : 2025/12/21 15:35:27.
// =============================================================================

import type { Denops } from "@denops/std";
import { type Type, type } from "arktype";

export type Bool =
  | boolean
  | (({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<boolean>);

/**
 * Represents a boolean or a function that returns a Promise<boolean>.
 * Corresponds to the `Bool` type.
 */
export const BoolSchema = type("boolean | Function") as Type<Bool>;

export const ConfigSchema = type("Function") as Type<
  ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>
>;

/**
 * Represents a plugin definition.
 */
export type Plug = {
  /**
   * Repository URL or shorthand (e.g., "owner/repo").
   */
  url: string;
  /**
   * Destination directory path. If omitted, it's calculated from the URL.
   */
  dst?: string;
  /**
   * Git revision (branch, tag, or commit hash).
   */
  rev?: string;
  /**
   * Whether the plugin is enabled. Can be a boolean or a function.
   */
  enabled?: Bool;
  /**
   * List of profiles this plugin belongs to.
   */
  profiles?: string[];
  /**
   * Configuration to run before adding to runtimepath.
   */
  before?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  /**
   * Configuration to run after adding to runtimepath.
   */
  after?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  /**
   * Path to a Vim/Lua file to source before adding to runtimepath.
   */
  beforeFile?: string;
  /**
   * Path to a Vim/Lua file to source after adding to runtimepath.
   */
  afterFile?: string;
  /**
   * Build configuration to run after installation or update.
   */
  build?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  /**
   * Whether to clone the plugin repository.
   */
  clone?: Bool;
  /**
   * Git clone depth.
   */
  depth?: number;
  /**
   * List of dependency plugin URLs.
   */
  dependencies?: string[];
  /**
   * Cache configuration.
   */
  cache?: {
    enabled?: Bool;
    before?: string;
    after?: string;
    beforeFile?: string;
    afterFile?: string;
  };
  /**
   * Whether to load the plugin lazily.
   */
  lazy?: boolean;
  /**
   * Load the plugin when the command is executed.
   */
  cmd?: string | string[];
  /**
   * Load the plugin when the event is triggered.
   */
  event?: string | string[];
  /**
   * Load the plugin when the filetype is detected.
   */
  ft?: string | string[];
  /**
   * Load the plugin when the key is pressed.
   */
  keys?: string | string[];
  /**
   * Internal flag: whether the plugin is loaded.
   */
  isLoad?: boolean;
  /**
   * Internal flag: whether the plugin was updated.
   */
  isUpdate?: boolean;
  /**
   * Internal flag: whether the plugin is cached.
   */
  isCache?: boolean;
  /**
   * Internal flag: elapsed time for loading.
   */
  elaps?: number;
};

const _PlugSchema = type({
  url: "string",
  "dst?": "string",
  "rev?": "string",
  enabled: BoolSchema.default(true),
  profiles: type("string[]").default(() => []),
  "before?": ConfigSchema,
  "after?": ConfigSchema,
  "beforeFile?": "string",
  "afterFile?": "string",
  "build?": ConfigSchema,
  clone: BoolSchema.default(false),
  depth: "number = 0",
  dependencies: type("string[]").default(() => []),
  cache: type({
    enabled: BoolSchema.default(false),
    "before?": "string",
    "after?": "string",
    "beforeFile?": "string",
    "afterFile?": "string",
  }).default(() => ({ enabled: false })),
  "lazy?": "boolean",
  "cmd?": "string | string[]",
  "event?": "string | string[]",
  "ft?": "string | string[]",
  "keys?": "string | string[]",
  isLoad: "boolean = false",
  isUpdate: "boolean = false",
  isCache: "boolean = false",
  elaps: "number = 0",
});

export const PlugSchema: Type<Plug> = _PlugSchema as unknown as Type<Plug>;

const _PlugInfoSchema = type(_PlugSchema, "&", {
  dst: "string",
});
/**
 * Detailed plugin information used internally and in callbacks.
 */
export type PlugInfo = {
  url: string;
  dst: string;
  rev?: string;
  enabled: Bool;
  profiles: string[];
  before?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  after?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  beforeFile?: string;
  afterFile?: string;
  build?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  clone: Bool;
  depth: number;
  dependencies: string[];
  cache: {
    enabled: Bool;
    before?: string;
    after?: string;
    beforeFile?: string;
    afterFile?: string;
  };
  lazy?: boolean;
  cmd?: string | string[];
  event?: string | string[];
  ft?: string | string[];
  keys?: string | string[];
  isLoad: boolean;
  isUpdate: boolean;
  isCache: boolean;
  elaps: number;
};
export const PlugInfoSchema: Type<PlugInfo> = _PlugInfoSchema as unknown as Type<PlugInfo>;

const _PlugOptionSchema = type({
  base: "string",
  profiles: type("string[]").default(() => []),
  logarg: type("string[]").default(() => []),
});
/**
 * Options for a single plugin.
 */
export type PlugOption = {
  /**
   * Base directory for plugins.
   */
  base: string;
  /**
   * Active profiles.
   */
  profiles: string[];
  /**
   * Additional arguments for git log.
   */
  logarg: string[];
};
export const PlugOptionSchema: Type<PlugOption> = _PlugOptionSchema as unknown as Type<PlugOption>;

const _DvpmOptionSchema = type({
  base: "string",
  "cache?": "string",
  profiles: type("string[]").default(() => []),
  concurrency: "number = 8",
  notify: "boolean = false",
  logarg: type("string[]").default(() => []),
});
export const DvpmOptionSchema: Type<DvpmOption> = _DvpmOptionSchema as unknown as Type<DvpmOption>;

/**
 * Global options for Dvpm.
 */
export type DvpmOption = {
  /**
   * Base directory where plugins will be installed.
   */
  base: string;
  /**
   * File path for the generated cache script.
   */
  cache?: string;
  /**
   * List of active profiles to load.
   */
  profiles?: string[];
  /**
   * Maximum number of concurrent git operations.
   */
  concurrency?: number;
  /**
   * Whether to use `vim.notify` for progress notifications.
   */
  notify?: boolean;
  /**
   * Additional arguments for git log during updates.
   */
  logarg?: string[];
};
