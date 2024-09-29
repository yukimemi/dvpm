// =============================================================================
// File        : types.ts
// Author      : yukimemi
// Last Change : 2024/09/29 21:19:19.
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
  enabled: BoolSchema.optional().default(true),
  before: ConfigSchema.optional(),
  after: ConfigSchema.optional(),
  beforeFile: z.string().optional(),
  afterFile: z.string().optional(),
  build: ConfigSchema.optional(),
  clone: BoolSchema.optional().default(true),
  depth: z.number().optional().default(0),
  dependencies: z.array(z.string()).optional().default([]),
  cache: z.object({
    enabled: BoolSchema.optional().default(false),
    before: z.string().optional(),
    after: z.string().optional(),
    beforeFile: z.string().optional(),
    afterFile: z.string().optional(),
  }).optional().default({ enabled: false }),
  isLoad: z.boolean().optional().default(false),
  isUpdate: z.boolean().optional().default(false),
  isCache: z.boolean().optional().default(false),
  elaps: z.number().optional().default(0),
});

export const PlugInfoSchema = PlugSchema.merge(z.object({
  dst: z.string(),
}));
export type PlugInfo = z.infer<typeof PlugInfoSchema>;

export const PlugOptionSchema = z.object({
  base: z.string(),
  debug: z.boolean().optional().default(false),
  profile: z.boolean().optional().default(false),
  logarg: z.array(z.string()).optional().default([]),
});
export type PlugOption = z.infer<typeof PlugOptionSchema>;

export const DvpmOptionSchema = z.object({
  base: z.string(),
  cache: z.string().optional(),
  debug: z.boolean().default(false).optional(),
  concurrency: z.number().default(8).optional(),
  profile: z.boolean().default(false).optional(),
  notify: z.boolean().default(false).optional(),
  logarg: z.array(z.string()).default([]).optional(),
});
export type DvpmOption = z.infer<typeof DvpmOptionSchema>;
