import { Effect, Function } from "effect";
import type { Scope } from "effect";
import type { Actor, AnyActorLogic, AnyStateMachine, OutputFrom } from "xstate";
import { createActor, toPromise } from "xstate";

import type { Route } from "../lifecycle/golden-route.ts";
import { inputOnReaching, nextAfter } from "../lifecycle/golden-route.ts";
import type { Settled } from "../lifecycle/stage-contract.ts";
import type { FailureReason, StageInput, StageName } from "../lifecycle/stage.ts";
import type { Fake, FakePort, Misbehaving } from "./fake-script.ts";
import { crashMessage, gaveUpMessage } from "./fake-script.ts";
import type { PortGaveUp } from "./port-stage.ts";

/** A port stage built with a fresh fake for the port the stage runs first, plus any other fakes it needs. */
export interface ScriptedPortStage<Step extends string> {
  readonly fake: Pick<Fake<unknown, Step>, "calls" | "started" | "interrupted">;
  readonly stage: AnyStateMachine;
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
  readonly next: string;
  /** The step the stage asks its port first, which the contract suites make misbehave. */
  readonly firstStep: Step;
  /** The reason the stage fails with when its port gives up during `firstStep`. */
  readonly gaveUp: FailureReason;
  /** The message the stage crashes with when its port dies during `firstStep`. */
  readonly crashMessage: string;
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

/** Completes a stage folder's declaration with the input its stage is reached with and a runner from that input. */
export const portStageUnderTest = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  declaration: PortStageDeclaration<Step, Script, Scripted>,
): PortStageUnderTest<Step, Script, Scripted> => {
  const input = inputOnReaching(declaration.name, declaration.route);
  const { port } = declaration;
  const [firstStep] = port.steps;
  const gaveUp = port.gaveUp(gaveUpMessage(port.port, firstStep));
  return {
    ...declaration,
    input,
    next: nextAfter(declaration.name, declaration.route),
    firstStep,
    gaveUp: { tag: gaveUp._tag, message: gaveUp.message },
    crashMessage: crashMessage(port.port, firstStep),
    run: Effect.fnUntraced(function* (script: Script, from: StageInput = input) {
      const scripted = yield* declaration.scripted(script);
      const settled = yield* runAlone(createActor(scripted.stage, { input: from }));
      return { ...scripted, settled };
    }),
  };
};
