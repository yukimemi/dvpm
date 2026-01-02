// =============================================================================
// File        : types.ts
// Author      : yukimemi
// Last Change : 2026/01/01 21:26:06.
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
 * Represents a command definition.
 */
export type Command = {
  name: string;
  complete?: string;
};

const _CommandSchema = type({
  name: "string",
  "complete?": "string",
});

export const CommandSchema: Type<Command> = _CommandSchema as unknown as Type<Command>;

/**
 * Represents a key mapping definition.
 */
export type KeyMap = {
  /**
   * Left-hand side of the mapping.
   */
  lhs: string;
  /**
   * Right-hand side of the mapping.
   */
  rhs: string;
  /**
   * Mode(s) for the mapping. Default is "n".
   */
  mode?: string | string[];
  /**
   * Whether the mapping is non-recursive. Default is true.
   */
  noremap?: boolean;
  /**
   * Whether the mapping is silent. Default is true.
   */
  silent?: boolean;
  /**
   * Whether the mapping is nowait. Default is false.
   */
  nowait?: boolean;
  /**
   * Whether the mapping is an expression. Default is false.
   */
  expr?: boolean;
};

const _KeyMapSchema = type({
  lhs: "string",
  rhs: "string",
  "mode?": "string | string[]",
  "noremap?": "boolean",
  "silent?": "boolean",
  "nowait?": "boolean",
  "expr?": "boolean",
});

export const KeyMapSchema: Type<KeyMap> = _KeyMapSchema as unknown as Type<KeyMap>;

/**
 * Represents the type of load trigger.
 */
export type LoadType = "cmd" | "keys" | "ft" | "event";

/**
 * Schema for the arguments of the load method.
 */
export type LoadArgs = {
  url: string;
  loadType: LoadType;
  arg: string;
  params?: CmdParams;
};

export type CmdParams = {
  args?: string;
  bang?: string;
  line1?: number;
  line2?: number;
  range?: number;
  count?: number;
};

const _CmdParamsSchema = type({
  "args?": "string",
  "bang?": "string",
  "line1?": "number",
  "line2?": "number",
  "range?": "number",
  "count?": "number",
});

const _LoadArgsSchema = type({
  url: "string",
  loadType: "'cmd' | 'keys' | 'ft' | 'event'",
  arg: "string",
  "params?": _CmdParamsSchema.or("undefined"),
});

export const LoadArgsSchema: Type<LoadArgs> = _LoadArgsSchema as unknown as Type<LoadArgs>;

/**
 * Represents a plugin definition.
 */
export type Plug = {
  /**
   * Repository URL or shorthand (e.g., "owner/repo").
   */
  url: string;
  /**
   * Plugin name. If omitted, it's calculated from the URL or dst.
   */
  name?: string;
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
   * Configuration to run at startup.
   */
  add?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  /**
   * Configuration to run before adding to runtimepath.
   */
  before?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  /**
   * Configuration to run after adding to runtimepath.
   */
  after?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  /**
   * Path to a Vim/Lua file to source at startup.
   */
  addFile?: string;
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
  cmd?: string | Command | (string | Command)[];
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
  keys?: string | string[] | KeyMap | KeyMap[];
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
  "name?": "string",
  "dst?": "string",
  "rev?": "string",
  enabled: BoolSchema.default(true),
  profiles: type("string[]").default(() => []),
  "add?": ConfigSchema,
  "before?": ConfigSchema,
  "after?": ConfigSchema,
  "addFile?": "string",
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
  "cmd?": type(CommandSchema, "|", "string").array().or(CommandSchema).or("string"),
  "event?": "string | string[]",
  "ft?": "string | string[]",
  "keys?": type(KeyMapSchema, "|", "string").array().or(KeyMapSchema).or("string"),
  isLoad: "boolean = false",
  isUpdate: "boolean = false",
  isCache: "boolean = false",
  elaps: "number = 0",
});

export const PlugSchema: Type<Plug> = _PlugSchema as unknown as Type<Plug>;

const _PlugInfoSchema = type(_PlugSchema, "&", {
  dst: "string",
  name: "string",
});
/**
 * Detailed plugin information used internally and in callbacks.
 */
export type PlugInfo = {
  /**
   * Repository URL.
   */
  url: string;
  /**
   * Destination directory path.
   */
  dst: string;
  /**
   * Plugin name (basename of dst).
   */
  name: string;
  /**
   * Git revision.
   */
  rev?: string;
  enabled: Bool;
  profiles: string[];
  add?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  before?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  after?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  addFile?: string;
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
  cmd?: string | Command | (string | Command)[];
  event?: string | string[];
  ft?: string | string[];
  keys?: string | string[] | KeyMap | KeyMap[];
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
