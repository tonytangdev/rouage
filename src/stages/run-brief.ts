import { Schema } from "effect";

import type { StageInput } from "../lifecycle/stage.ts";

/** What every port task a retry can reach carries about the run it belongs to. */
export const RunBriefSchema = Schema.Struct({
  workItemId: Schema.String,
  /** The feedback for this run, such as a retry's comment or why a human rejected the stage's last answer, or null when there is none. */
  feedback: Schema.NullOr(Schema.String),
});
export type RunBrief = typeof RunBriefSchema.Type;

/** The run brief of the stage run `input` starts. */
export const briefOf = (input: StageInput): RunBrief => ({
  workItemId: input.workItemId,
  feedback: input.feedback,
});
