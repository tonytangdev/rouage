import { Schema } from "effect";

import { KindSchema } from "../lifecycle/kind.ts";
import type { StageFailure, StageInput } from "../lifecycle/stage.ts";
import { RunBriefSchema, briefOf } from "./run-brief.ts";
import { sandboxMissing } from "./sandbox-missing.ts";

/** What a stage that looks at the built change is given: where the change is, and what it was built from. */
export const BuiltChangeSchema = Schema.Struct({
  ...RunBriefSchema.fields,
  issueRef: Schema.String,
  kind: Schema.NullOr(KindSchema),
  specRef: Schema.NullOr(Schema.String),
  /** The plan Build followed, or `null` when the lifecycle runs no Plan. */
  planRef: Schema.NullOr(Schema.String),
  /** The sandbox holding the change and its tests. */
  sandboxRef: Schema.String,
  /** The bug's reproduction, or `null` for a feature. */
  reproductionRef: Schema.NullOr(Schema.String),
});
export type BuiltChange = typeof BuiltChangeSchema.Type;

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
export const DemonstratedChangeSchema = Schema.Struct({
  ...BuiltChangeSchema.fields,
  /** The demo of the change, or `null` when there is none to show. */
  demoRef: Schema.NullOr(Schema.String),
});
export type DemonstratedChange = typeof DemonstratedChangeSchema.Type;
