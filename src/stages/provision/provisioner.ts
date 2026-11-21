import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { RunBrief } from "../run-brief.ts";

export interface ProvisionTask extends RunBrief {
  readonly issueRef: string;
  readonly specRef: string | null;
  /** The work item's current sandbox, for the provisioner to reuse or replace; `null` on the first provision. */
  readonly previousSandboxRef: string | null;
}

export interface Provisioned {
  readonly sandboxRef: string;
}

/** The provisioner could not prepare a sandbox. */
export class ProvisionerGaveUp extends Data.TaggedError("ProvisionerGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Provision stage prepares the work item's sandbox through:
 * images built, services started, data seeded. It keeps at most one live
 * sandbox per work item, so `provision` reuses or replaces it and the
 * lifecycle's sandbox teardown finds it by work item ID (ADR 0005, ADR 0007).
 * Returns an opaque reference other plugins find the sandbox by (ADR 0004).
 * Usually filled by a Sandbox plugin, which fills the teardown port too.
 */
export class Provisioner extends Context.Service<
  Provisioner,
  {
    readonly provision: (task: ProvisionTask) => Effect.Effect<Provisioned, ProvisionerGaveUp>;
  }
>()("rouage/stages/provision/Provisioner") {}
