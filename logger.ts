// =============================================================================
// File        : logger.ts
// Author      : yukimemi
// Last Change : 2024/09/29 11:01:47.
// =============================================================================

import { getLogger } from "jsr:@std/log@0.224.8";

export function logger() {
  return getLogger("dvpm");
}
