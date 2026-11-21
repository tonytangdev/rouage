import { Effect, Function } from "effect";
import type { Scope } from "effect";
import type { Actor, AnyActorLogic, AnyStateMachine, OutputFrom } from "xstate";
import { createActor, toPromise } from "xstate";

import type { Route } from "../lifecycle/golden-route.ts";
import { inputOnReaching, nextAfter } from "../lifecycle/golden-route.ts";
import type { TestWorkItem } from "../lifecycle/lifecycle-harness.ts";
import type { Place } from "../lifecycle/place.ts";
import type { Settled } from "../lifecycle/stage-contract.ts";
import type { FailureReason, StageInput, StageName } from "../lifecycle/stage.ts";
import type { Fake, FakePort, Misbehaviour, Misbehaving } from "./fake-script.ts";
import { crashMessage, gaveUpMessage } from "./fake-script.ts";
import type { PortGaveUp } from "./port-stage.ts";
import type { RunBrief } from "./run-brief.ts";

/** A port stage built with a fresh fake for the port the stage runs first, plus any other fakes it needs. */
export interface ScriptedPortStage<Step extends string> {
  readonly fake: Pick<Fake<unknown, Step>, "calls" | "started" | "interrupted">;
  readonly stage: AnyStateMachine;
}

/**
 * A step the stage's `passing` script does not reach, declared with how to
 * reach it so the contract suites make it misbehave like any other step.
 */
export interface UnreachedStep<Step extends string, Script, Scripted> {
  /** The port the step belongs to, the stage's own or another it calls. */
  readonly port: FakePort<Step, PortGaveUp>;
  readonly step: NoInfer<Step>;
  /** The fake standing in for `port` in a scripted stage. */
  readonly fake: (scripted: Scripted) => Pick<Fake<unknown, Step>, "started" | "interrupted">;
  /** A script whose run reaches `step`, which misbehaves `as` given. */
  readonly misbehaving: (as: Misbehaviour) => Script;
  /** An input under which the stage, run alone, reaches `step`. */
  readonly input: StageInput;
  /** Drives a new work item to where the stage runs `step`. */
  readonly reach: (workItem: TestWorkItem) => Effect.Effect<void, unknown>;
}

/** One step of a port stage as the contract suites exercise it, whatever its port. */
export interface ReachableStep<Script, Scripted> {
  readonly port: string;
  /** Every step of `port`, for the check that each one is declared. */
  readonly portSteps: readonly string[];
  readonly step: string;
  readonly misbehaving: (as: Misbehaviour) => Script;
  readonly started: (scripted: Scripted) => Effect.Effect<void>;
  readonly interrupted: (scripted: Scripted) => Effect.Effect<void>;
  readonly input: StageInput;
  readonly reach: (workItem: TestWorkItem) => Effect.Effect<void, unknown>;
  /** The reason the stage fails with when the port gives up during this step. */
  readonly gaveUp: FailureReason;
  /** The message the stage crashes with when the port dies during this step. */
  readonly crashMessage: string;
}

/** Declares an unreached step for a stage whose scripts are `Script`, keeping each port's own step type. */
export type DeclareUnreached<Script, Scripted> = <Step extends string>(
  declared: UnreachedStep<Step, Script, Scripted>,
) => ReachableStep<Script, Scripted>;

const reachableStep = <Script, Scripted>(
  port: FakePort<string, PortGaveUp>,
  step: string,
  rest: Omit<
    ReachableStep<Script, Scripted>,
    "port" | "portSteps" | "step" | "gaveUp" | "crashMessage"
  >,
): ReachableStep<Script, Scripted> => {
  const gaveUp = port.gaveUp(gaveUpMessage(port.port, step));
  return {
    ...rest,
    port: port.port,
    portSteps: port.steps,
    step,
    gaveUp: { tag: gaveUp._tag, message: gaveUp.message },
    crashMessage: crashMessage(port.port, step),
  };
};

const unreachedStep = <Step extends string, Script, Scripted>(
  declared: UnreachedStep<Step, Script, Scripted>,
): ReachableStep<Script, Scripted> =>
  reachableStep(declared.port, declared.step, {
    misbehaving: declared.misbehaving,
    started: (scripted) => declared.fake(scripted).started(declared.step),
    interrupted: (scripted) => declared.fake(scripted).interrupted(declared.step),
    input: declared.input,
    reach: declared.reach,
  });

/** A port's name and every step it has, for the check that each step is declared. */
export interface DeclaredPort {
  readonly port: string;
  readonly steps: readonly string[];
}

/** What a stage folder declares once about its port stage, for its tests and both contract suites. */
export interface PortStageDeclaration<
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
> {
  readonly name: StageName;
  readonly port: FakePort<Step, PortGaveUp>;
  /** Builds the stage with fresh fakes that follow `script`. */
  readonly scripted: (script: Script) => Effect.Effect<Scripted, unknown, Scope.Scope>;
  /** A script that finishes the stage with `outcome`, unless `misbehaving` says otherwise. */
  readonly passing: (misbehaving?: Misbehaving<Step>) => NoInfer<Script>;
  readonly outcome: unknown;
  /** The route the work item takes to reach the stage; a feature with no demo unless set. */
  readonly route?: Route;
  /** What the stage's first step is asked when it is reached along `route`. */
  readonly firstTask: RunBrief;
  /** The steps of `port` that `passing` reaches along `route`, in order; only the first unless set. */
  readonly reached?: readonly [Step, ...Step[]];
}

/** A declared port stage, ready to run outside any lifecycle. */
export interface PortStageUnderTest<
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
> extends PortStageDeclaration<Step, Script, Scripted> {
  /** The input the stage receives when the work item first reaches it along `route`. */
  readonly input: StageInput;
  /** Where the lifecycle sends the work item once the stage finishes on `route`. */
  readonly next: Place;
  /** The step the stage asks its port first, which the contract suites make misbehave. */
  readonly firstStep: Step;
  /** The reason the stage fails with when its port gives up during `firstStep`. */
  readonly gaveUp: FailureReason;
  /** The message the stage crashes with when its port dies during `firstStep`. */
  readonly crashMessage: string;
  /** The steps of `port` that `passing` reaches, `reached` or only the first step. */
  readonly passingReaches: readonly Step[];
  /** Every step the stage runs, the first leading, for the contract suites to make misbehave. */
  readonly steps: ReadonlyArray<ReachableStep<Script, Scripted>>;
  /** Every port the stage's steps belong to, `port` first. */
  readonly ports: readonly DeclaredPort[];
  /** Runs the stage outside any lifecycle until it finishes or fails, starting from `input` unless given another. */
  readonly run: (
    script: Script,
    input?: StageInput,
  ) => Effect.Effect<Scripted & { readonly settled: Settled<unknown> }, unknown, Scope.Scope>;
}

/** Builds a port stage's `scripted` from its fake and its stage, the fake's layer providing the port the stage takes from context. */
export const scriptedStage =
  <Script, Id, Step extends string, Machine, E>(
    fake: (script: Script) => Effect.Effect<Fake<Id, Step>>,
    stage: Effect.Effect<Machine, E, Id>,
  ) =>
  (script: Script) =>
    Effect.gen(function* () {
      const made = yield* fake(script);
      return { fake: made, stage: yield* stage.pipe(Effect.provide(made.layer)) };
    });

/** Starts a stage actor outside any lifecycle and waits until it finishes or fails; the actor stops when the test's scope closes. */
const runAlone = Effect.fnUntraced(function* <Logic extends AnyActorLogic>(actor: Actor<Logic>) {
  // A root actor's error with no error observer is reported to the host as unhandled.
  actor.subscribe({ error: Function.constVoid });
  yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    (running) => Effect.sync(() => running.stop()),
  );
  return yield* Effect.promise((): Promise<Settled<OutputFrom<Actor<Logic>>>> =>
    toPromise(actor).then(
      (output) => ({ output, error: undefined }),
      (error: unknown) => ({ output: undefined, error }),
    ),
  );
});

const portsOf = (
  steps: ReadonlyArray<Pick<ReachableStep<unknown, unknown>, "port" | "portSteps">>,
): DeclaredPort[] =>
  [...new Map(steps.map(({ port, portSteps }) => [port, portSteps])).entries()].map(
    ([port, all]) => ({ port, steps: all }),
  );

/**
 * Completes a stage folder's declaration with the input its stage is reached
 * with, a runner from that input, and every step the contract suites make
 * misbehave: each of `reached` along `route`, then each step `unreached`
 * declares through `declare`.
 */
export const portStageUnderTest = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  declaration: PortStageDeclaration<Step, Script, Scripted>,
  unreached: (
    declare: DeclareUnreached<NoInfer<Script>, NoInfer<Scripted>>,
  ) => ReadonlyArray<ReachableStep<NoInfer<Script>, NoInfer<Scripted>>> = () => [],
): PortStageUnderTest<Step, Script, Scripted> => {
  const input = inputOnReaching(declaration.name, declaration.route);
  const { port, route } = declaration;
  const [firstStep] = port.steps;
  const ownStep = (step: Step) =>
    reachableStep<Script, Scripted>(port, step, {
      misbehaving: (as) => declaration.passing({ step, as }),
      started: (scripted) => scripted.fake.started(step),
      interrupted: (scripted) => scripted.fake.interrupted(step),
      input,
      reach: (workItem) =>
        Effect.sync(() => {
          workItem.advanceTo(declaration.name, route);
        }),
    });
  const first = ownStep(firstStep);
  const passingReaches = declaration.reached ?? [firstStep];
  const [, ...laterReached] = passingReaches;
  const steps = [first, ...laterReached.map(ownStep), ...unreached(unreachedStep)];
  return {
    ...declaration,
    input,
    next: nextAfter(declaration.name, route),
    firstStep,
    gaveUp: first.gaveUp,
    crashMessage: first.crashMessage,
    passingReaches,
    steps,
    ports: portsOf(steps),
    run: Effect.fnUntraced(function* (script: Script, from: StageInput = input) {
      const scripted = yield* declaration.scripted(script);
      const settled = yield* runAlone(createActor(scripted.stage, { input: from }));
      return { ...scripted, settled };
    }),
  };
};
