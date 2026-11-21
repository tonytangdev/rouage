import { Schema } from "effect";

import { FailureReasonSchema, StageNameSchema } from "./stage.ts";

/** Why a work item is blocked, and the stage a retry re-enters. */
export const BlockedSchema = Schema.Struct({ from: StageNameSchema, reason: FailureReasonSchema });
export type Blocked = typeof BlockedSchema.Type;
