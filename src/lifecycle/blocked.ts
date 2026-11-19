import { Predicate } from "effect";

import type { FailureReason } from "./outcomes.ts";

export type StageName =
  | "intake"
  | "spec"
  | "provision"
  | "reproduce"
  | "plan"
  | "build"
  | "demo"
  | "review"
  | "ship";

export interface Blocked {
  readonly from: StageName;
  readonly reason: FailureReason;
}

export const blockedOn = (from: StageName, reason: FailureReason) => ({
  target: "blocked" as const,
  context: { blocked: { from, reason } },
});

export const stageCrashed =
  (from: StageName) =>
  ({ event }: { event: { error: unknown } }) =>
    blockedOn(from, {
      tag: "StageCrashed",
      message: Predicate.isError(event.error) ? event.error.message : String(event.error),
    });

export const loopLimitReached = (from: StageName, message: string) =>
  blockedOn(from, { tag: "LoopLimitReached", message });
