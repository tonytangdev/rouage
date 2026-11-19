import { Effect } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import type { ProvisionTask } from "./provisioner.ts";
import { Provisioner } from "./provisioner.ts";
import type { SampleTask } from "./sampler.ts";
import { Sampler } from "./sampler.ts";

interface Steps {
  readonly provisioner: PortStep<Provisioner["Service"]>;
  readonly sampler: PortStep<Sampler["Service"]>;
}

interface Sandboxed {
  readonly sandboxRef: string;
}

interface SampleRequested extends Sandboxed {
  readonly sampleRequest: string;
}

const provisionTask = ({ context }: { readonly context: StageInput }): ProvisionTask => ({
  workItemId: context.workItemId,
  issueRef: context.issueRef,
  specRef: context.specRef,
  previousSandboxRef: context.sandboxRef,
});

const sampleTask = ({
  context,
  input,
}: {
  readonly context: StageInput;
  readonly input: SampleRequested;
}): SampleTask => ({
  workItemId: context.workItemId,
  sandboxRef: input.sandboxRef,
  sampleRequest: input.sampleRequest,
  previousSampleRef: context.sampleRef,
});

const sampleAwaitingRun = (scriptRef: string) =>
  new StageFailure({
    reason: {
      tag: "SampleAwaitingRun",
      message: `Review and run the extraction script ${scriptRef}, then retry`,
    },
  });

const provisionSetup = (steps: Steps) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
      output: types<OutcomeOf<"provision">>(),
    },
    actors: {
      provision: steps.provisioner((provisioner, task: ProvisionTask) =>
        provisioner.provision(task),
      ),
      // Answers with the sandbox it sampled into, because a state's input does not reach its `onDone`.
      sample: steps.sampler((sampler, task: SampleTask) =>
        Effect.map(sampler.sample(task), (sampled) => ({ sandboxRef: task.sandboxRef, sampled })),
      ),
    },
    states: {
      provisioning: {},
      sampling: { schemas: { input: types<SampleRequested>() } },
      provisioned: {
        type: "final",
        schemas: { input: types<Sandboxed & { readonly sampleRef: string | null }>() },
      },
    },
  });

const provisionMachine = (steps: Steps) =>
  provisionSetup(steps).createMachine({
    id: "provision",
    context: ({ input }) => input,
    initial: "provisioning",
    states: {
      provisioning: {
        invoke: {
          id: "provision",
          src: "provision",
          input: provisionTask,
          onDone: ({ context, event: { output } }) =>
            context.sampleRequest === null
              ? { target: "provisioned", input: { sandboxRef: output.sandboxRef, sampleRef: null } }
              : {
                  target: "sampling",
                  input: { sandboxRef: output.sandboxRef, sampleRequest: context.sampleRequest },
                },
        },
      },
      sampling: {
        invoke: {
          id: "sample",
          src: "sample",
          input: sampleTask,
          onDone: ({ event: { output } }) => {
            if (output.sampled._tag === "awaitingRun") {
              throw sampleAwaitingRun(output.sampled.scriptRef);
            }
            return {
              target: "provisioned",
              input: { sandboxRef: output.sandboxRef, sampleRef: output.sampled.sampleRef },
            };
          },
        },
      },
      provisioned: {
        type: "final",
        output: ({ input }) => ({
          _tag: "provisioned",
          sandboxRef: input.sandboxRef,
          sampleRef: input.sampleRef,
        }),
      },
    },
  });

/**
 * The Provision stage machine: prepares the work item's sandbox with the
 * `Provisioner` in context, then, when Reproduce asked for one, takes a
 * sample into it with the `Sampler` in context. Finishes with references to
 * both. Fails with a `StageFailure` when the user must run an extraction
 * script first (ADR 0005), or when either port cannot finish.
 */
export const provisionStage = Effect.flatten(
  portStage(Provisioner, (provisioner) =>
    portStage(Sampler, (sampler) => provisionMachine({ provisioner, sampler })),
  ),
);
