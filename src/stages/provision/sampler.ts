import type { Effect } from "effect";
import { Context, Data } from "effect";

export interface SampleTask {
  readonly workItemId: string;
  readonly sandboxRef: string;
  /** Reproduce's description of the data the bug needs, passed on as written. */
  readonly sampleRequest: string;
  /** The sample taken before, which may still be in the sandbox; `null` on the first sample. */
  readonly previousSampleRef: string | null;
  /** The extraction script the user was last asked to run; they ran it unless `feedback` says why they rejected it. `null` before any. */
  readonly previousScriptRef: string | null;
  /** Why the user rejected the previous extraction script, for the next one to address; `null` when they did not. */
  readonly feedback: string | null;
}

/**
 * The sampler's answer: a reference to the sample now in the sandbox, or
 * `awaitingRun` when, under schema access, the user must review and run the
 * extraction script behind `scriptRef` first (ADR 0001).
 */
export type Sampled =
  | { readonly _tag: "sampled"; readonly sampleRef: string }
  | { readonly _tag: "awaitingRun"; readonly scriptRef: string };

/** The sampler could not reach the data source, write a sample, or find a usable sample after the user ran its extraction script. */
export class SamplerGaveUp extends Data.TaggedError("SamplerGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Provision stage takes a sample through, from a data source
 * into the work item's sandbox, under the access rules of ADR 0001. Usually
 * filled by a Data source plugin.
 */
export class Sampler extends Context.Service<
  Sampler,
  {
    readonly sample: (task: SampleTask) => Effect.Effect<Sampled, SamplerGaveUp>;
  }
>()("rouage/stages/provision/Sampler") {}
