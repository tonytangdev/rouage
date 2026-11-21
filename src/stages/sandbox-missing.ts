import { StageFailure } from "../lifecycle/stage.ts";

/**
 * The failure of the stage named `stage`, as messages call it, that runs in the work item's sandbox but started
 * without one. The default lifecycle runs Provision first, so this means a
 * lifecycle that skips Provision.
 */
export const sandboxMissing = (stage: string) =>
  new StageFailure({
    reason: {
      tag: "SandboxMissing",
      message: `${stage} started without a sandbox; send the work item back to Spec so Provision prepares one`,
    },
  });
