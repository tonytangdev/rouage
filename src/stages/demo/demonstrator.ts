import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { BuiltChange } from "../built-change.ts";

export interface DemoTask extends BuiltChange {
  /** The demo made before, for the demonstrator to revise; `null` on the first demo. */
  readonly previousDemoRef: string | null;
}

/** The demonstrator's answer: a reference to the demo it stored. */
export interface Demonstrated {
  readonly demoRef: string;
}

/** The demonstrator could not make the demo, such as when the change has nothing it can show. */
export class DemonstratorGaveUp extends Data.TaggedError("DemonstratorGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Demo stage captures evidence that a change works through: it
 * makes the demo in the work item's sandbox, in a form it chooses, and stores
 * it behind an opaque reference (ADR 0004). A restart runs `demonstrate` again
 * for the same task, so the demonstrator must replace whatever it stored for
 * that task rather than add to it. Usually filled by an Agent plugin.
 */
export class Demonstrator extends Context.Service<
  Demonstrator,
  { readonly demonstrate: (task: DemoTask) => Effect.Effect<Demonstrated, DemonstratorGaveUp> }
>()("rouage/stages/demo/Demonstrator") {}
