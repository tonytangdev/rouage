import { Data, Effect, Function } from "effect";
import type { Scope } from "effect";
import type { Actor, AnyActorLogic, AnyStateMachine, OutputFrom } from "xstate";
import { createActor, toPromise } from "xstate";

import type { TestWorkItem } from "../lifecycle/lifecycle-harness.ts";
import { inputOnReaching, nextAfter, startWorkItem } from "../lifecycle/lifecycle-harness.ts";
import type { Place } from "../lifecycle/place.ts";
import type { Settled } from "../lifecycle/stage-contract.ts";
import type { FailureReason, StageInput, StageName } from "../lifecycle/stage.ts";
import { stageInputs } from "../lifecycle/stage.ts";
import type { Route } from "../lifecycle/test-fixtures.ts";
import type { Fake, FakePort, Misbehaviour, Misbehaving } from "./fake-script.ts";
import { crashMessage, gaveUpMessage } from "./fake-script.ts";
import type { PortGaveUp } from "./port-stage.ts";
import type { RunBrief } from "./run-brief.ts";

/** Thrown when a test asks for the input of a step its stage does not declare. */
export class StepNotDeclared extends Data.TaggedError("StepNotDeclared")<{
  readonly step: string;
}> {}

/** A port stage built with a fresh fake for the port the stage runs first, plus any other fakes it needs. */
export interface ScriptedPortStage<Step extends string> {
  readonly fake: Pick<Fake<unknown, Step>, "calls" | "started" | "interrupted">;
  readonly stage: AnyStateMachine;
}

/**
 * A step of the stage's own port that its `passing` script does not reach,
 * declared with how to reach it so the contract suites make it misbehave like
 * any other step. The stage, run alone, is given the input it receives once
 * `reach` has driven a work item there.
 */
export interface UnreachedOwnStep<Step extends string, Script> {
  readonly step: Step;
  /** A script whose run reaches `step`, which misbehaves `as` given. */
  readonly misbehaving: (as: Misbehaviour) => Script;
  /** Drives a new work item to where the stage runs `step`. */
  readonly reach: (workItem: TestWorkItem) => Effect.Effect<void, unknown>;
}

/** An unreached step of another port the stage calls, with the fake standing in for that port. */
export interface UnreachedStep<Step extends string, Script, Scripted> extends Omit<
  UnreachedOwnStep<Step, Script>,
  "step"
> {
  readonly port: FakePort<Step, PortGaveUp>;
  readonly step: NoInfer<Step>;
  /** The fake standing in for `port` in a scripted stage. */
  readonly fake: (scripted: Scripted) => Pick<Fake<unknown, Step>, "started" | "interrupted">;
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
  /** The input under which the stage, run alone, reaches this step. */
  readonly input: Effect.Effect<StageInput, unknown, Scope.Scope>;
  readonly reach: (workItem: TestWorkItem) => Effect.Effect<void, unknown>;
  /** The reason the stage fails with when the port gives up during this step. */
  readonly gaveUp: FailureReason;
  /** The message the stage crashes with when the port dies during this step. */
  readonly crashMessage: string;
}

/** Declares an unreached step for a stage whose scripts are `Script`: one of its own port's, or of another port, keeping that port's step type. */
export interface DeclareUnreached<OwnStep extends string, Script, Scripted> {
  (declared: UnreachedOwnStep<OwnStep, Script>): ReachableStep<Script, Scripted>;
  <Step extends string>(
    declared: UnreachedStep<Step, Script, Scripted>,
  ): ReachableStep<Script, Scripted>;
}

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

/** The input `stage` receives once `reach` drives a work item there, with the stage `scripted` running. */
const inputOnReach = <Scripted extends { readonly stage: AnyStateMachine }>(
  stage: StageName,
  scripted: Effect.Effect<Scripted, unknown, Scope.Scope>,
  reach: (workItem: TestWorkItem) => Effect.Effect<void, unknown>,
) =>
  Effect.gen(function* () {
    const { stage: machine } = yield* scripted;
    const workItem = yield* startWorkItem({ stages: { [stage]: machine } });
    yield* reach(workItem);
    // Read from the work item's context because a real stage, unlike a stub,
    // does not report its input.
    return stageInputs[stage]({ context: workItem.context() });
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
  /** The input under which the stage, run alone, reaches `step`. */
  readonly inputAt: (step: string) => Effect.Effect<StageInput, unknown, Scope.Scope>;
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

/** The `declare` a stage folder declares its unreached steps through, its own port's steps defaulting to the stage's fake. */
const declarer = <Step extends string, Script, Scripted extends ScriptedPortStage<Step>>(
  declaration: PortStageDeclaration<Step, Script, Scripted>,
): DeclareUnreached<Step, Script, Scripted> => {
  const reachedBy = (declared: UnreachedOwnStep<string, Script>) =>
    inputOnReach(
      declaration.name,
      declaration.scripted(declared.misbehaving("hanging")),
      declared.reach,
    );
  function declare(declared: UnreachedOwnStep<Step, Script>): ReachableStep<Script, Scripted>;
  function declare<Other extends string>(
    declared: UnreachedStep<Other, Script, Scripted>,
  ): ReachableStep<Script, Scripted>;
  function declare<Other extends string>(
    declared: UnreachedOwnStep<Step, Script> | UnreachedStep<Other, Script, Scripted>,
  ): ReachableStep<Script, Scripted> {
    if ("port" in declared) {
      return reachableStep(declared.port, declared.step, {
        misbehaving: declared.misbehaving,
        started: (scripted) => declared.fake(scripted).started(declared.step),
        interrupted: (scripted) => declared.fake(scripted).interrupted(declared.step),
        input: reachedBy(declared),
        reach: declared.reach,
      });
    }
    return reachableStep(declaration.port, declared.step, {
      misbehaving: declared.misbehaving,
      started: (scripted) => scripted.fake.started(declared.step),
      interrupted: (scripted) => scripted.fake.interrupted(declared.step),
      input: reachedBy(declared),
      reach: declared.reach,
    });
  }
  return declare;
};

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
    declare: DeclareUnreached<NoInfer<Step>, NoInfer<Script>, NoInfer<Scripted>>,
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
      input: Effect.succeed(input),
      reach: (workItem) =>
        Effect.sync(() => {
          workItem.advanceTo(declaration.name, route);
        }),
    });
  const first = ownStep(firstStep);
  const passingReaches = declaration.reached ?? [firstStep];
  const [, ...laterReached] = passingReaches;
  const steps = [first, ...laterReached.map(ownStep), ...unreached(declarer(declaration))];
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
    inputAt: (step) =>
      Effect.suspend(() => {
        const found = steps.find((declared) => declared.step === step);
        return found === undefined ? Effect.die(new StepNotDeclared({ step })) : found.input;
      }),
    run: Effect.fnUntraced(function* (script: Script, from: StageInput = input) {
      const scripted = yield* declaration.scripted(script);
      const settled = yield* runAlone(createActor(scripted.stage, { input: from }));
      return { ...scripted, settled };
    }),
  };
};
