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

export type Plug = {
  url: string;
  dst?: string;
  rev?: string;
  enabled?: Bool;
  profiles?: string[];
  before?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  after?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
  beforeFile?: string;
  afterFile?: string;
  build?: ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;
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
  isLoad: "boolean = false",
  isUpdate: "boolean = false",
  isCache: "boolean = false",
  elaps: "number = 0",
});

export const PlugSchema: Type<Plug> = _PlugSchema as unknown as Type<Plug>;

const _PlugInfoSchema = type(_PlugSchema, "&", {
  dst: "string",
});
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
  isLoad: boolean;
  isUpdate: boolean;
  isCache: boolean;
  elaps: number;
};
export const PlugInfoSchema: Type<PlugInfo> = _PlugInfoSchema as unknown as Type<PlugInfo>;

const _PlugOptionSchema = type({
  base: "string",
  debug: "boolean = false",
  profiles: type("string[]").default(() => []),
  logarg: type("string[]").default(() => []),
});
export type PlugOption = {
  base: string;
  debug: boolean;
  profiles: string[];
  logarg: string[];
};
export const PlugOptionSchema: Type<PlugOption> = _PlugOptionSchema as unknown as Type<PlugOption>;

const _DvpmOptionSchema = type({
  base: "string",
  "cache?": "string",
  debug: "boolean = false",
  profiles: type("string[]").default(() => []),
  concurrency: "number = 8",
  notify: "boolean = false",
  logarg: type("string[]").default(() => []),
});
export const DvpmOptionSchema: Type<DvpmOption> = _DvpmOptionSchema as unknown as Type<DvpmOption>;

export type DvpmOption = {
  base: string;
  cache?: string;
  debug?: boolean;
  profiles?: string[];
  concurrency?: number;
  notify?: boolean;
  logarg?: string[];
};
