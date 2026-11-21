import { Effect, Schema } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageInputSchema, StageOutcomeSchemas, stageInputContext } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import { briefOf } from "../run-brief.ts";
import { Provisioner } from "./provisioner.ts";
import type { Sampled } from "./sampler.ts";
import { Sampler } from "./sampler.ts";

interface Prepared {
  readonly sandboxRef: string;
  /** The sampler's answer, or `null` when no sample was requested. */
  readonly sampled: Sampled | null;
}

// Provisioning and sampling are one step, because a step restored mid-way
// runs again from its start: a sample is then taken into a sandbox that is
// provisioned again, in case the restart lost it.
const prepare = (provisioner: Provisioner["Service"], sampler: Sampler["Service"]) =>
  Effect.fnUntraced(function* (input: StageInput) {
    const { sandboxRef } = yield* provisioner.provision({
      ...briefOf(input),
      issueRef: input.issueRef,
      specRef: input.specRef,
      previousSandboxRef: input.sandboxRef,
    });
    if (input.sampleRequest === null) {
      return { sandboxRef, sampled: null } satisfies Prepared;
    }
    const sampled = yield* sampler.sample({
      ...briefOf(input),
      sandboxRef,
      sampleRequest: input.sampleRequest,
      previousSampleRef: input.sampleRef,
      previousScriptRef: input.scriptRef,
    });
    return { sandboxRef, sampled } satisfies Prepared;
  });

const outcomeOf = ({ sandboxRef, sampled }: Prepared): OutcomeOf<"provision"> =>
  sampled?._tag === "awaitingRun"
    ? { _tag: "awaitingRun", sandboxRef, scriptRef: sampled.scriptRef }
    : { _tag: "provisioned", sandboxRef, sampleRef: sampled?.sampleRef ?? null };

const provisionSetup = (step: PortStep<Provisioner["Service"]>, sampler: Sampler["Service"]) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: stageInputContext,
      output: types<OutcomeOf<"provision">>(),
    },
    actors: {
      prepare: step(StageInputSchema, (provisioner, input) => prepare(provisioner, sampler)(input)),
    },
    states: {
      preparing: {},
      prepared: {
        type: "final",
        schemas: { input: Schema.toStandardSchemaV1(StageOutcomeSchemas.provision) },
      },
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
            onDone: ({ event: { output } }) => ({
              target: "prepared",
              input: outcomeOf(output),
            }),
          },
        },
        prepared: { type: "final", output: ({ input }) => input },
      },
    });

/**
 * The Provision stage machine: prepares the work item's sandbox with the
 * `Provisioner` in context, then, when Reproduce asked for one, takes a
 * sample into it with the `Sampler` in context. Finishes with references to
 * both, or with `awaitingRun` and the extraction script the user must run
 * first under schema access (ADR 0008). Fails, blocking the work item, when
 * either port cannot finish.
 */
export const provisionStage = Effect.gen(function* () {
  const sampler = yield* Sampler;
  return yield* portStage(Provisioner, provisionMachine(sampler));
});
