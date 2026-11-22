import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fakeSandbox } from "./fake-sandbox.ts";
import { firstProvision } from "./provision-harness.ts";
import { describeSandboxContract, sandboxContract } from "./sandbox-contract.ts";

describeSandboxContract("the fake sandbox", fakeSandbox(), firstProvision);

describe("the sandbox contract against a sandbox that breaks it", () => {
  const promises = sandboxContract(firstProvision);

  it.effect("fails when provisioning again leaves the previous sandbox live", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        promises.provisioningAgainKeepsOne.check.pipe(
          Effect.provide(fakeSandbox("keepsPreviousSandbox")),
        ),
      );
      expect(error).toMatchObject({ _tag: "PluginBrokeContract" });
    }),
  );

  it.effect("fails when a teardown leaves the sandbox live", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        promises.teardownLeavesNoSandbox.check.pipe(
          Effect.provide(fakeSandbox("teardownLeavesSandbox")),
        ),
      );
      expect(error).toMatchObject({ _tag: "PluginBrokeContract" });
    }),
  );

  it.effect("fails when a teardown gives up on a work item with no sandbox", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        promises.teardownWithoutSandbox.check.pipe(
          Effect.provide(fakeSandbox("teardownNeedsSandbox")),
        ),
      );
      expect(error).toMatchObject({ _tag: "TeardownGaveUp" });
    }),
  );
});
