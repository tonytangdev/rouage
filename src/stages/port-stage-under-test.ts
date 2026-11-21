import { Effect } from "effect";
import type { Scope } from "effect";
import type { AnyStateMachine } from "xstate";
import { createActor } from "xstate";

import type { Route, Waypoint } from "../lifecycle/lifecycle-harness.ts";
import { inputOnReaching } from "../lifecycle/lifecycle-harness.ts";
import type { Settled } from "../lifecycle/stage-contract.ts";
import type { StageInput, StageName } from "../lifecycle/stage.ts";
import type { Fake, FakePort, Misbehaving } from "./fake-script.ts";
import type { PortGaveUp } from "./port-stage.ts";
import { runAlone } from "./stage-harness.ts";

/** A port stage built with a fresh fake for the port the stage runs first, plus any other fakes it needs. */
export interface ScriptedPortStage<Step extends string> {
  readonly fake: Pick<Fake<unknown, Step>, "calls" | "started">;
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
  /** Where the work item goes once the stage finishes on `route`. */
  readonly next: Waypoint;
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
  /** Runs the stage outside any lifecycle until it finishes or fails, starting from `input` unless given another. */
  readonly run: (
    script: Script,
    input?: StageInput,
  ) => Effect.Effect<Scripted & { readonly settled: Settled<unknown> }, unknown, Scope.Scope>;
}

/** Completes a stage folder's declaration with the input its stage is reached with and a runner from that input. */
export const portStageUnderTest = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  declaration: PortStageDeclaration<Step, Script, Scripted>,
): PortStageUnderTest<Step, Script, Scripted> => {
  const input = inputOnReaching(declaration.name, declaration.route);
  return {
    ...declaration,
    input,
    run: Effect.fnUntraced(function* (script: Script, from: StageInput = input) {
      const scripted = yield* declaration.scripted(script);
      const settled = yield* runAlone(createActor(scripted.stage, { input: from }));
      return { ...scripted, settled };
    }),
  };
};
