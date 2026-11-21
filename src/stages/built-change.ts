import type { Kind } from "../lifecycle/kind.ts";
import type { StageFailure, StageInput } from "../lifecycle/stage.ts";
import type { RunBrief } from "./run-brief.ts";
import { briefOf } from "./run-brief.ts";
import { sandboxMissing } from "./sandbox-missing.ts";

/** What a stage that looks at the built change is given: where the change is, and what it was built from. */
export interface BuiltChange extends RunBrief {
  readonly issueRef: string;
  readonly kind: Kind | null;
  readonly specRef: string | null;
  /** The plan Build followed, or `null` when the lifecycle runs no Plan. */
  readonly planRef: string | null;
  /** The sandbox holding the change and its tests. */
  readonly sandboxRef: string;
  /** The bug's reproduction, or `null` for a feature. */
  readonly reproductionRef: string | null;
}

/**
 * The task of the stage named `stage`, as messages call it: the built change
 * from `input` with the stage's own `extra` fields, or the failure
 * `sandboxMissing` gives when the work item has no sandbox.
 */
export const builtChangeTask = <Extra extends object>(
  stage: string,
  input: StageInput,
  extra: Extra,
): (BuiltChange & Extra) | StageFailure =>
  input.sandboxRef === null
    ? sandboxMissing(stage)
    : {
        ...briefOf(input),
        issueRef: input.issueRef,
        kind: input.kind,
        specRef: input.specRef,
        planRef: input.planRef,
        sandboxRef: input.sandboxRef,
        reproductionRef: input.reproductionRef,
        ...extra,
      };

/** What a stage that judges or delivers the finished change is given: the built change and the demo of it. */
export interface DemonstratedChange extends BuiltChange {
  /** The demo of the change, or `null` when there is none to show. */
  readonly demoRef: string | null;
}
