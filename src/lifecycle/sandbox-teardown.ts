import type { Effect } from "effect";
import { Context, Data } from "effect";

export interface TeardownTask {
  readonly workItemId: string;
}

/** The plugin could not tear down a work item's sandbox. */
export class TeardownGaveUp extends Data.TaggedError("TeardownGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the lifecycle tears down a finished work item's sandbox through,
 * along with any sample in it (ADR 0001). Usually filled by the same Sandbox
 * plugin as the Provision stage's provisioner. The lifecycle may call
 * `teardown` more than once for a work item, and for one that never had a
 * sandbox, so it must succeed when there is none. It may also arrive while an
 * interrupted provision of the same work item is still unwinding, and the two
 * must end with no live sandbox (ADR 0007).
 */
export class SandboxTeardown extends Context.Service<
  SandboxTeardown,
  {
    readonly teardown: (task: TeardownTask) => Effect.Effect<void, TeardownGaveUp>;
  }
>()("rouage/lifecycle/SandboxTeardown") {}
