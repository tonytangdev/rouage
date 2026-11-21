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

/** A port stage built with a fresh fake for the port the stage runs first, plus any other fakes it needs. */
export interface ScriptedPortStage<Step extends string> {
  readonly fake: Pick<Fake<unknown, Step>, "calls" | "started" | "interrupted">;
  readonly stage: AnyStateMachine;
}

/**
 * A port the stage calls after its first one, declared so the contract suites
 * make it misbehave the same way as the first.
 */
export interface LaterPort<Step extends string, Script, Scripted> {
  readonly port: FakePort<Step, PortGaveUp>;
  /** The fake standing in for this port in a scripted stage. */
  readonly fake: (scripted: Scripted) => Pick<Fake<unknown, Step>, "started" | "interrupted">;
  /** A script whose run reaches this port's first step, which misbehaves `as` given. */
  readonly misbehaving: (as: Misbehaviour) => Script;
  /** An input under which the stage, run alone, reaches this port. */
  readonly input: StageInput;
  /** Drives a new work item to where the stage calls this port. */
  readonly reach: (workItem: TestWorkItem) => Effect.Effect<void, unknown>;
}

/** One port of a port stage as the contract suites exercise it, whatever its steps. */
export interface PortCase<Script, Scripted> {
  readonly port: string;
  readonly misbehaving: (as: Misbehaviour) => Script;
  readonly started: (scripted: Scripted) => Effect.Effect<void>;
  readonly interrupted: (scripted: Scripted) => Effect.Effect<void>;
  readonly input: StageInput;
  /** Drives a new work item to where the stage calls this port. */
  readonly reach: (workItem: TestWorkItem) => Effect.Effect<void, unknown>;
  /** The reason the stage fails with when this port gives up. */
  readonly gaveUp: FailureReason;
  /** The message the stage crashes with when this port dies. */
  readonly crashMessage: string;
}

/** Builds a later port's case for a stage whose scripts are `Script`, keeping each port's own step type. */
export type LaterPortCase<Script, Scripted> = <Step extends string>(
  declared: LaterPort<Step, Script, Scripted>,
) => PortCase<Script, Scripted>;

const laterPort = <Step extends string, Script, Scripted>(
  declared: LaterPort<Step, Script, Scripted>,
): PortCase<Script, Scripted> => {
  const [firstStep] = declared.port.steps;
  return portCase(declared.port, firstStep, {
    misbehaving: declared.misbehaving,
    started: (scripted) => declared.fake(scripted).started(firstStep),
    interrupted: (scripted) => declared.fake(scripted).interrupted(firstStep),
    input: declared.input,
    reach: declared.reach,
  });
};

const portCase = <Script, Scripted>(
  port: FakePort<string, PortGaveUp>,
  firstStep: string,
  rest: Omit<PortCase<Script, Scripted>, "port" | "gaveUp" | "crashMessage">,
): PortCase<Script, Scripted> => {
  const gaveUp = port.gaveUp(gaveUpMessage(port.port, firstStep));
  return {
    ...rest,
    port: port.port,
    gaveUp: { tag: gaveUp._tag, message: gaveUp.message },
    crashMessage: crashMessage(port.port, firstStep),
  };
};

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
  readonly firstTask: unknown;
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
  /** Every port the stage calls, `port` first, for the contract suites to make misbehave. */
  readonly ports: ReadonlyArray<PortCase<Script, Scripted>>;
  /** Runs the stage outside any lifecycle until it finishes or fails, starting from `input` unless given another. */
  readonly run: (
    script: Script,
    input?: StageInput,
  ) => Effect.Effect<Scripted & { readonly settled: Settled<unknown> }, unknown, Scope.Scope>;
}

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

/** Completes a stage folder's declaration with the input its stage is reached with, a runner from that input, and the ports `laterPorts` declares after the first, each through `laterPort`. */
export const portStageUnderTest = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  declaration: PortStageDeclaration<Step, Script, Scripted>,
  laterPorts: (
    laterPort: LaterPortCase<NoInfer<Script>, NoInfer<Scripted>>,
  ) => ReadonlyArray<PortCase<NoInfer<Script>, NoInfer<Scripted>>> = () => [],
): PortStageUnderTest<Step, Script, Scripted> => {
  const input = inputOnReaching(declaration.name, declaration.route);
  const { port, route } = declaration;
  const [firstStep] = port.steps;
  const first = portCase<Script, Scripted>(port, firstStep, {
    misbehaving: (as) => declaration.passing({ step: firstStep, as }),
    started: (scripted) => scripted.fake.started(firstStep),
    interrupted: (scripted) => scripted.fake.interrupted(firstStep),
    input,
    reach: (workItem) =>
      Effect.sync(() => {
        workItem.advanceTo(declaration.name, route);
      }),
  });
  return {
    ...declaration,
    input,
    next: nextAfter(declaration.name, route),
    firstStep,
    gaveUp: first.gaveUp,
    crashMessage: first.crashMessage,
    ports: [first, ...laterPorts(laterPort)],
    run: Effect.fnUntraced(function* (script: Script, from: StageInput = input) {
      const scripted = yield* declaration.scripted(script);
      const settled = yield* runAlone(createActor(scripted.stage, { input: from }));
      return { ...scripted, settled };
    }),
  };
};
