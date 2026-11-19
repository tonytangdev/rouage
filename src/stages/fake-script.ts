import { Deferred, Effect } from "effect";

import type { PortGaveUp } from "./port-stage.ts";

/** How a scripted fake port goes wrong: `failing` gives up, `crashing` dies with a defect, `hanging` never finishes so a test can save or stop the work item mid-step. */
export type Misbehaviour = "failing" | "crashing" | "hanging";

/** A step of a fake port that goes wrong every time it runs, and how. */
export interface Misbehaving<Step extends string> {
  readonly step: Step;
  readonly as: Misbehaviour;
}

/** The message a fake port gives up with when `failing` during `step`. */
export const gaveUpMessage = (port: string, step: string) => `The ${port} gave up during ${step}`;

/** The defect message a fake port dies with when `crashing` during `step`. */
export const crashMessage = (port: string, step: string) => `The ${port} exited during ${step}`;

/** A port as its fake declares it once, for the fake's workings and the stage contract suite alike. */
export interface FakePort<Step extends string, GaveUp extends PortGaveUp> {
  /** The port's name as messages call it. */
  readonly port: string;
  /** Every step of the port, the one a stage runs first leading. */
  readonly steps: readonly [Step, ...Step[]];
  readonly gaveUp: (message: string) => GaveUp;
}

interface PortScript<Step extends string, GaveUp extends PortGaveUp> extends FakePort<
  Step,
  GaveUp
> {
  readonly misbehaving: Misbehaving<Step> | undefined;
}

const behaving = <A, GaveUp extends PortGaveUp>(
  script: PortScript<string, GaveUp>,
  step: string,
  answer: Effect.Effect<A>,
): Effect.Effect<A, GaveUp> => {
  const mode = script.misbehaving?.step === step ? script.misbehaving.as : undefined;
  if (mode === "failing") {
    return Effect.fail(script.gaveUp(gaveUpMessage(script.port, step)));
  }
  if (mode === "crashing") {
    return Effect.die(new Error(crashMessage(script.port, step)));
  }
  return mode === "hanging" ? Effect.never : answer;
};

/**
 * The shared workings of a fake port: it records every call, signals when
 * each step first starts, and runs a step's scripted answer unless the
 * script makes that step misbehave. Each fake supplies only its answers.
 */
export const scriptedPort = Effect.fnUntraced(function* <
  Step extends string,
  Call extends { readonly step: Step },
  GaveUp extends PortGaveUp,
>(script: PortScript<Step, GaveUp>) {
  const calls: Call[] = [];
  const begun = new Map<string, Deferred.Deferred<boolean>>();
  for (const step of script.steps) {
    begun.set(step, yield* Deferred.make<boolean>());
  }
  const begunSignal = (step: string) => {
    const deferred = begun.get(step);
    return deferred === undefined
      ? Effect.die(new Error(`The fake ${script.port} has no step ${step}`))
      : Effect.succeed(deferred);
  };
  return {
    run: <A>(call: Call, answer: Effect.Effect<A>) =>
      Effect.suspend(() => {
        calls.push(call);
        return begunSignal(call.step).pipe(
          Effect.flatMap((deferred) => Deferred.succeed(deferred, true)),
          Effect.andThen(behaving(script, call.step, answer)),
        );
      }),
    calls: (): readonly Call[] => calls,
    started: (step: Step) => begunSignal(step).pipe(Effect.flatMap(Deferred.await), Effect.asVoid),
  };
});

/** Hands out `answers` in order, one per run; a run beyond them dies, so a test that under-scripts its fake fails loudly. */
export const scriptedAnswers = <A>(answers: readonly A[], fake: string) => {
  const queue = [...answers];
  return Effect.suspend(() => {
    const answer = queue.shift();
    return answer === undefined
      ? Effect.die(new Error(`The fake ${fake} ran out of scripted answers`))
      : Effect.succeed(answer);
  });
};
