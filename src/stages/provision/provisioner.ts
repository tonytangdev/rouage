import type { Effect } from "effect";
import { Context, Data } from "effect";

export interface ProvisionTask {
  readonly workItemId: string;
  readonly issueRef: string;
  readonly specRef: string | null;
  /** The work item's current sandbox, for the provisioner to reuse or replace; `null` on the first provision. */
  readonly previousSandboxRef: string | null;
}

export interface Provisioned {
  readonly sandboxRef: string;
}

export interface TeardownTask {
  readonly workItemId: string;
}

/** The provisioner could not prepare or tear down a sandbox. */
export class ProvisionerGaveUp extends Data.TaggedError("ProvisionerGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Provision stage prepares the work item's sandbox through:
 * images built, services started, data seeded. It keeps at most one live
 * sandbox per work item, so `provision` reuses or replaces it and `teardown`
 * finds it by work item ID (ADR 0005). Returns an opaque reference other
 * plugins find the sandbox by (ADR 0004). Usually filled by a Sandbox plugin.
 */
export class Provisioner extends Context.Service<
  Provisioner,
  {
    readonly provision: (task: ProvisionTask) => Effect.Effect<Provisioned, ProvisionerGaveUp>;
    readonly teardown: (task: TeardownTask) => Effect.Effect<void, ProvisionerGaveUp>;
  }
>()("rouage/stages/provision/Provisioner") {}
