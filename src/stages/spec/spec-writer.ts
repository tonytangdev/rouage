import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { Kind } from "../../lifecycle/stage.ts";

export interface WriteTask {
  readonly workItemId: string;
  readonly issueRef: string;
  readonly kind: Kind;
  /** A human's comment from rejecting the spec or sending the work item back to Spec, passed on as written. */
  readonly feedback: string | null;
  /** The reference to the spec written before, for the writer to revise; `null` on the first write. */
  readonly previous: string | null;
}

/** The writer's answer: a reference to the spec it stored, or `unclear` when the issue does not say what should happen. */
export type Written =
  | { readonly _tag: "written"; readonly specRef: string }
  | { readonly _tag: "unclear"; readonly reason: string };

/** The spec writer could not read the issue or store a spec at all, as opposed to finding the issue unclear. */
export class SpecWriterGaveUp extends Data.TaggedError("SpecWriterGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Spec stage writes through: it reads the issue behind
 * `issueRef`, writes the expected behaviour, stores it where it chooses and
 * returns an opaque reference to it (ADR 0004). Usually filled by an Agent
 * plugin.
 */
export class SpecWriter extends Context.Service<
  SpecWriter,
  {
    readonly write: (task: WriteTask) => Effect.Effect<Written, SpecWriterGaveUp>;
  }
>()("rouage/stages/spec/SpecWriter") {}
