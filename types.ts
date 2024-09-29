// =============================================================================
// File        : types.ts
// Author      : yukimemi
// Last Change : 2024/09/29 15:49:12.
// =============================================================================

import type { Denops } from "jsr:@denops/std@7.2.0";
import { z } from "npm:zod@3.23.8";

export type Bool =
  | boolean
  | (({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<boolean>);

export const BoolSchema: z.ZodType<Bool> = z.union([
  z.boolean(),
  z.function().args(z.object({
    denops: z.any().transform((v) => v as Denops),
    info: z.lazy(() => PlugInfoSchema),
  })).returns(z.promise(z.boolean())),
]);

export type Config = ({ denops, info }: { denops: Denops; info: PlugInfo }) => Promise<void>;

export const ConfigSchema: z.ZodType<Config> = z.function().args(z.object({
  denops: z.any().transform((v) => v as Denops),
  info: z.lazy(() => PlugInfoSchema),
})).returns(z.promise(z.void()));

export type Plug = {
  url: string;
  dst?: string;
  rev?: string;
  enabled?: Bool;
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

export const PlugSchema = z.object({
  url: z.string(),
  dst: z.string().optional(),
  rev: z.string().optional(),
  enabled: BoolSchema.default(true),
  before: ConfigSchema.optional(),
  after: ConfigSchema.optional(),
  beforeFile: z.string().optional(),
  afterFile: z.string().optional(),
  build: ConfigSchema.optional(),
  clone: BoolSchema.default(true),
  depth: z.number().default(0),
  dependencies: z.array(z.string()).default([]),
  cache: z.object({
    enabled: BoolSchema.default(false),
    before: z.string().optional(),
    after: z.string().optional(),
    beforeFile: z.string().optional(),
    afterFile: z.string().optional(),
  }).default({ enabled: false }),
  isLoad: z.boolean().default(false),
  isUpdate: z.boolean().default(false),
  isCache: z.boolean().default(false),
  elaps: z.number().default(0),
});

export const PlugInfoSchema = PlugSchema.merge(z.object({
  dst: z.string(),
}));
export type PlugInfo = z.infer<typeof PlugInfoSchema>;

export const PlugOptionSchema = z.object({
  base: z.string(),
  debug: z.boolean().default(false),
  profile: z.boolean().default(false),
  logarg: z.array(z.string()).default([]),
});
export type PlugOption = z.infer<typeof PlugOptionSchema>;

export const DvpmOptionSchema = z.object({
  base: z.string(),
  cache: z.string().optional(),
  debug: z.boolean().default(false),
  concurrency: z.number().default(8),
  profile: z.boolean().default(false),
  notify: z.boolean().default(false),
  logarg: z.array(z.string()).default([]),
});
export type DvpmOption = z.infer<typeof DvpmOptionSchema>;
