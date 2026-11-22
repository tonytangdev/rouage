import type { Layer } from "effect";
import { Context, Effect } from "effect";

import { SandboxTeardown } from "../../lifecycle/sandbox-teardown.ts";
import type { PluginPromise } from "../plugin-contract.ts";
import { describePluginContract, promiseKept } from "../plugin-contract.ts";
import type { ProvisionTask } from "./provisioner.ts";
import { Provisioner } from "./provisioner.ts";

/**
 * What the sandbox contract asks of a Sandbox plugin beyond its ports, which
 * cannot show how many sandboxes are live: the number of live sandboxes the
 * plugin holds for a work item.
 */
export class SandboxProbe extends Context.Service<
  SandboxProbe,
  { readonly liveSandboxes: (workItemId: string) => Effect.Effect<number, unknown> }
>()("rouage/stages/provision/SandboxProbe") {}

/** The ports a Sandbox plugin fills, with the probe the sandbox contract reads. */
export type SandboxPorts = Provisioner | SandboxTeardown | SandboxProbe;

const liveSandboxesAre = Effect.fnUntraced(function* (workItemId: string, expected: number) {
  const probe = yield* SandboxProbe;
  const live = yield* probe.liveSandboxes(workItemId);
  yield* promiseKept(
    live === expected,
    `Expected ${expected} live sandbox(es) for ${workItemId}, found ${live}`,
  );
});

const tearDown = Effect.fnUntraced(function* (workItemId: string) {
  const sandbox = yield* SandboxTeardown;
  yield* Effect.ignore(sandbox.teardown({ workItemId }));
});

// A real plugin's sandboxes outlive a failed check, so each check tears down what it provisioned.
const tornDownAfter = <A, E, R>(workItemId: string, check: Effect.Effect<A, E, R>) =>
  check.pipe(Effect.ensuring(tearDown(workItemId)));

const forCase = (task: ProvisionTask, name: string): ProvisionTask => ({
  ...task,
  workItemId: `${task.workItemId}-${name}`,
  previousSandboxRef: null,
});

/**
 * The promises of the Provisioner and SandboxTeardown ports (ADR 0005,
 * ADR 0007), each a check provisioning from `task` under a work item id of
 * its own, derived from `task`'s, and tearing down what it provisioned.
 */
export const sandboxContract = (task: ProvisionTask) => {
  const never = forCase(task, "never-provisioned");
  const twice = forCase(task, "torn-down-twice");
  const torn = forCase(task, "torn-down");
  const again = forCase(task, "provisioned-again");
  return {
    teardownWithoutSandbox: {
      name: "tears down a work item that never had a sandbox",
      check: Effect.gen(function* () {
        const sandbox = yield* SandboxTeardown;
        yield* sandbox.teardown({ workItemId: never.workItemId });
      }),
    },
    teardownTwice: {
      name: "tears down the same work item twice",
      check: Effect.gen(function* () {
        const provisioner = yield* Provisioner;
        const sandbox = yield* SandboxTeardown;
        yield* provisioner.provision(twice);
        yield* sandbox.teardown({ workItemId: twice.workItemId });
        yield* sandbox.teardown({ workItemId: twice.workItemId });
      }),
    },
    teardownLeavesNoSandbox: {
      name: "leaves no live sandbox once a work item is torn down",
      check: tornDownAfter(
        torn.workItemId,
        Effect.gen(function* () {
          const provisioner = yield* Provisioner;
          const sandbox = yield* SandboxTeardown;
          yield* provisioner.provision(torn);
          yield* liveSandboxesAre(torn.workItemId, 1);
          yield* sandbox.teardown({ workItemId: torn.workItemId });
          yield* liveSandboxesAre(torn.workItemId, 0);
        }),
      ),
    },
    provisioningAgainKeepsOne: {
      name: "keeps one live sandbox when a work item is provisioned again",
      check: tornDownAfter(
        again.workItemId,
        Effect.gen(function* () {
          const provisioner = yield* Provisioner;
          const first = yield* provisioner.provision(again);
          yield* provisioner.provision({ ...again, previousSandboxRef: first.sandboxRef });
          yield* liveSandboxesAre(again.workItemId, 1);
        }),
      ),
    },
  } satisfies Record<string, PluginPromise<SandboxPorts>>;
};

/**
 * Declares the sandbox contract's tests for the Sandbox plugin `layer`
 * fills, provisioning from `task`, a task its provisioner can carry out.
 */
export const describeSandboxContract = <E>(
  title: string,
  layer: Layer.Layer<SandboxPorts, E>,
  task: ProvisionTask,
) => {
  describePluginContract(`sandbox contract, ${title}`, sandboxContract(task), layer);
};
