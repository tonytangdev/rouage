import type { Context } from "effect";
import { Deferred, Effect, Layer } from "effect";

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

/** One request a fake port received: the step and the task it was given. */
export interface FakeCall<Step extends string> {
  readonly step: Step;
  readonly task: unknown;
}

/** What a fake's port methods answer through, so each method is one line. */
export interface FakeSteps<Step extends string, GaveUp extends PortGaveUp> {
  /** Records the call, then answers with the next of `answers` for `step`; a run beyond them dies, so a test that under-scripts its fake fails loudly. */
  readonly answer: <A>(
    step: Step,
    task: unknown,
    answers: readonly A[],
  ) => Effect.Effect<A, GaveUp>;
  /** Records the call to a step that returns nothing. */
  readonly perform: (step: Step, task: unknown) => Effect.Effect<void, GaveUp>;
}

/** A fake port ready for a test: the layer that provides it and what it saw. */
export interface Fake<Id, Step extends string> {
  readonly layer: Layer.Layer<Id>;
  readonly calls: () => ReadonlyArray<FakeCall<Step>>;
  /** The tasks of every call, for a port a stage calls through one step. */
  readonly tasks: () => readonly unknown[];
  readonly steps: () => readonly Step[];
  /** Waits until `step` first starts, so a test can save the work item mid-step. */
  readonly started: (step: Step) => Effect.Effect<void>;
}

const misbehave = <A, GaveUp extends PortGaveUp>(
  port: FakePort<string, GaveUp>,
  step: string,
  mode: Misbehaviour | undefined,
  answer: Effect.Effect<A>,
): Effect.Effect<A, GaveUp> => {
  if (mode === "failing") {
    return Effect.fail(port.gaveUp(gaveUpMessage(port.port, step)));
  }
  if (mode === "crashing") {
    return Effect.die(new Error(crashMessage(port.port, step)));
  }
  return mode === "hanging" ? Effect.never : answer;
};

const startSignals = Effect.fnUntraced(function* <Step extends string>(steps: readonly Step[]) {
  const begun = new Map<Step, Deferred.Deferred<boolean>>();
  for (const step of steps) {
    begun.set(step, yield* Deferred.make<boolean>());
  }
  return (step: Step) => {
    const deferred = begun.get(step);
    return deferred === undefined
      ? Effect.die(new Error(`The fake has no step ${step}`))
      : Effect.succeed(deferred);
  };
});

const nextAnswer = <A>(answers: readonly A[], index: number, what: string) => {
  const answer = answers[index];
  return answer === undefined
    ? Effect.die(new Error(`The fake ran out of scripted answers to ${what}`))
    : Effect.succeed(answer);
};

/**
 * Builds a fake for the port behind `key`: `implement` maps each of the
 * port's methods to `answer` or `perform`, and the fake records every call,
 * signals when each step first starts, and makes the step in `misbehaving`
 * go wrong every time it runs.
 */
export const fakePort = Effect.fnUntraced(function* <
  Id,
  Service,
  Step extends string,
  GaveUp extends PortGaveUp,
>(
  key: Context.Key<Id, Service>,
  port: FakePort<Step, GaveUp>,
  misbehaving: Misbehaving<Step> | undefined,
  implement: (steps: FakeSteps<Step, GaveUp>) => Service,
) {
  const calls: Array<FakeCall<Step>> = [];
  const signal = yield* startSignals(port.steps);
  const record = <A>(step: Step, task: unknown, answer: Effect.Effect<A>) =>
    Effect.suspend(() => {
      calls.push({ step, task });
      return signal(step).pipe(
        Effect.flatMap((deferred) => Deferred.succeed(deferred, true)),
        Effect.andThen(
          misbehave(port, step, misbehaving?.step === step ? misbehaving.as : undefined, answer),
        ),
      );
    });
  const answered = (step: Step) => calls.filter((call) => call.step === step).length;
  const service = implement({
    answer: (step, task, answers) =>
      Effect.suspend(() =>
        record(step, task, nextAnswer(answers, answered(step), `${port.port} ${step}`)),
      ),
    perform: (step, task) => record(step, task, Effect.void),
  });
  return {
    layer: Layer.succeed(key, service),
    calls: () => calls,
    tasks: () => calls.map((call) => call.task),
    steps: () => calls.map((call) => call.step),
    started: (step) => signal(step).pipe(Effect.flatMap(Deferred.await), Effect.asVoid),
  } satisfies Fake<Id, Step>;
});
