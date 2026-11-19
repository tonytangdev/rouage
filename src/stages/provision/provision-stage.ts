import { Effect } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import { Provisioner } from "./provisioner.ts";
import type { Sampled } from "./sampler.ts";
import { Sampler } from "./sampler.ts";

interface Prepared {
  readonly sandboxRef: string;
  /** The sampler's answer, or `null` when no sample was requested. */
  readonly sampled: Sampled | null;
}

const sampleAwaitingRun = (scriptRef: string) =>
  new StageFailure({
    reason: {
      tag: "SampleAwaitingRun",
      message: `Review and run the extraction script ${scriptRef}, then retry`,
    },
  });

// Provisioning and sampling are one step, because a step restored mid-way
// runs again from its start: a sample is then taken into a sandbox that is
// provisioned again, in case the restart lost it.
const prepare = (provisioner: Provisioner["Service"], sampler: Sampler["Service"]) =>
  Effect.fnUntraced(function* (input: StageInput) {
    const { sandboxRef } = yield* provisioner.provision({
      workItemId: input.workItemId,
      issueRef: input.issueRef,
      specRef: input.specRef,
      previousSandboxRef: input.sandboxRef,
    });
    if (input.sampleRequest === null) {
      return { sandboxRef, sampled: null } satisfies Prepared;
    }
    const sampled = yield* sampler.sample({
      workItemId: input.workItemId,
      sandboxRef,
      sampleRequest: input.sampleRequest,
      previousSampleRef: input.sampleRef,
    });
    return { sandboxRef, sampled } satisfies Prepared;
  });

const provisionSetup = (step: PortStep<Provisioner["Service"]>, sampler: Sampler["Service"]) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
      output: types<OutcomeOf<"provision">>(),
    },
    actors: {
      prepare: step((provisioner, input: StageInput) => prepare(provisioner, sampler)(input)),
    },
    states: {
      preparing: {},
      provisioned: { type: "final", schemas: { input: types<OutcomeOf<"provision">>() } },
    },
  });

const provisionMachine =
  (sampler: Sampler["Service"]) => (step: PortStep<Provisioner["Service"]>) =>
    provisionSetup(step, sampler).createMachine({
      id: "provision",
      context: ({ input }) => input,
      initial: "preparing",
      states: {
        preparing: {
          invoke: {
            id: "prepare",
            src: "prepare",
            input: ({ context }) => context,
            onDone: ({ event: { output } }) => {
              if (output.sampled?._tag === "awaitingRun") {
                throw sampleAwaitingRun(output.sampled.scriptRef);
              }
              return {
                target: "provisioned",
                input: {
                  _tag: "provisioned",
                  sandboxRef: output.sandboxRef,
                  sampleRef: output.sampled?.sampleRef ?? null,
                },
              };
            },
          },
        },
        provisioned: { type: "final", output: ({ input }) => input },
      },
    });

/**
 * The Provision stage machine: prepares the work item's sandbox with the
 * `Provisioner` in context, then, when Reproduce asked for one, takes a
 * sample into it with the `Sampler` in context. Finishes with references to
 * both. Fails with a `StageFailure` when the user must run an extraction
 * script first (ADR 0005), or when either port cannot finish.
 */
export const provisionStage = Effect.gen(function* () {
  const sampler = yield* Sampler;
  return yield* portStage(Provisioner, provisionMachine(sampler));
});
