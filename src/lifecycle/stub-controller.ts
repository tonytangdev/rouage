import type { AnyActorRef, AnyStateMachine } from "xstate";

import { defaultLifecycle } from "./lifecycle.ts";
import type { StageInput, StageName } from "./stage.ts";
import type { AttachStub } from "./stub-stage.ts";
import { stubStages } from "./stub-stage.ts";

interface RunningStub {
  readonly self: AnyActorRef;
  readonly input: StageInput;
}

/** The stub stages running now, by stage. */
export type Running = ReadonlyMap<StageName, RunningStub>;

/** Real stage implementations to run instead of stubs; every other stage stays a stub. */
export type RealStages = Partial<Readonly<Record<StageName, AnyStateMachine>>>;

/** The default lifecycle with a stub for every stage not in `real`, and the stubs running now, by stage. */
export const stubController = (real: RealStages) => {
  const running = new Map<StageName, RunningStub>();
  const attach: AttachStub = (stage, self, input) => {
    running.set(stage, { self, input });
    return () => {
      if (running.get(stage)?.self === self) {
        running.delete(stage);
      }
    };
  };
  return {
    running,
    lifecycle: defaultLifecycle.provide({ actors: { ...stubStages(attach), ...real } }),
  };
};
