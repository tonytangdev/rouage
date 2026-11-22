import { Effect, Layer } from "effect";

import { SandboxTeardown, TeardownGaveUp } from "../../lifecycle/sandbox-teardown.ts";
import { Provisioner } from "./provisioner.ts";
import { SandboxProbe } from "./sandbox-contract.ts";

/** A promise of the sandbox contract a fake sandbox breaks, so a test shows the contract catches it. */
export type SandboxFlaw = "keepsPreviousSandbox" | "teardownLeavesSandbox" | "teardownNeedsSandbox";

/**
 * A Sandbox plugin that keeps its sandboxes as names in memory, with its
 * probe, keeping every promise of the sandbox contract unless it has `flaw`.
 */
export const fakeSandbox = (flaw?: SandboxFlaw) => {
  const live = new Map<string, readonly string[]>();
  let made = 0;
  const provisioner = Provisioner.of({
    provision: (task) =>
      Effect.sync(() => {
        made += 1;
        const sandboxRef = `box-${made}`;
        const kept = flaw === "keepsPreviousSandbox" ? (live.get(task.workItemId) ?? []) : [];
        live.set(task.workItemId, [...kept, sandboxRef]);
        return { sandboxRef };
      }),
  });
  const teardown = SandboxTeardown.of({
    teardown: ({ workItemId }) =>
      Effect.suspend(() => {
        if (flaw === "teardownNeedsSandbox" && !live.has(workItemId)) {
          return Effect.fail(new TeardownGaveUp({ message: `No sandbox for ${workItemId}` }));
        }
        if (flaw !== "teardownLeavesSandbox") {
          live.delete(workItemId);
        }
        return Effect.void;
      }),
  });
  const probe = SandboxProbe.of({
    liveSandboxes: (workItemId) => Effect.sync(() => live.get(workItemId)?.length ?? 0),
  });
  return Layer.mergeAll(
    Layer.succeed(Provisioner, provisioner),
    Layer.succeed(SandboxTeardown, teardown),
    Layer.succeed(SandboxProbe, probe),
  );
};
