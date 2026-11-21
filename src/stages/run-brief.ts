import type { StageInput } from "../lifecycle/stage.ts";

/** What every port task a retry can reach carries about the run it belongs to. */
export interface RunBrief {
  readonly workItemId: string;
  /** The feedback for this run, such as a retry's comment or why a human rejected the stage's last answer, or `null` when there is none. */
  readonly feedback: string | null;
}

/** The run brief of the stage run `input` starts. */
export const briefOf = (input: StageInput): RunBrief => ({
  workItemId: input.workItemId,
  feedback: input.feedback,
});
