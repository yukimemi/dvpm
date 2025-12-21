// =============================================================================
// File        : types.ts
// Author      : yukimemi
// Last Change : 2025/09/21 20:14:33.
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

export type Config = ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;

export const ConfigSchema = type("Function") as Type<Config>;

export type Plug = {
  url: string;
  dst?: string;
  rev?: string;
  enabled?: Bool;
  profiles?: string[];
  before?: Config;
  after?: Config;
  beforeFile?: string;
  afterFile?: string;
  build?: Config;
  clone?: Bool;
  depth?: number;
  dependencies?: string[];
  cache?: {
    enabled?: Bool;
    before?: string;
    after?: string;
    beforeFile?: string;
    afterFile?: string;
  };
  isLoad?: boolean;
  isUpdate?: boolean;
  isCache?: boolean;
  elaps?: number;
};

export const PlugSchema = type({
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
  isLoad: "boolean = false",
  isUpdate: "boolean = false",
  isCache: "boolean = false",
  elaps: "number = 0",
});

export const PlugInfoSchema = type(PlugSchema, "&", {
  dst: "string",
});
export type PlugInfo = typeof PlugInfoSchema.infer;

export const PlugOptionSchema = type({
  base: "string",
  debug: "boolean = false",
  profiles: type("string[]").default(() => []),
  logarg: type("string[]").default(() => []),
});
export type PlugOption = typeof PlugOptionSchema.infer;

export const DvpmOptionSchema = type({
  base: "string",
  "cache?": "string",
  debug: "boolean = false",
  profiles: type("string[]").default(() => []),
  concurrency: "number = 8",
  notify: "boolean = false",
  logarg: type("string[]").default(() => []),
});

export type DvpmOption = {
  base: string;
  cache?: string;
  debug?: boolean;
  profiles?: string[];
  concurrency?: number;
  notify?: boolean;
  logarg?: string[];
};
