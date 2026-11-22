import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { createAsyncLogic, setup, types } from "xstate";

import { startWorkItem, throughJson } from "./lifecycle-harness.ts";
import {
  savedStagesOf,
  savedStateInputsOf,
  savedStepsOf,
  withSavedStageContext,
  withSavedStateInput,
  withSavedStepTask,
} from "./saved-work-item.ts";
import type { StageInput } from "./stage.ts";
import { stageInputContext } from "./stage.ts";
import { withTaskSchema } from "./step-task.ts";

const Task = Schema.Struct({ issueRef: Schema.String });

const hangingStep = withTaskSchema(
  createAsyncLogic({ run: ({ signal }) => Effect.runPromise(Effect.never, { signal }) }),
  Task,
);

const intakeAskingForever = setup({
  schemas: { input: types<StageInput>(), context: stageInputContext },
  actors: { classify: hangingStep },
  states: {
    preparing: { type: "choice" },
    asking: { schemas: { input: Schema.toStandardSchemaV1(Task) } },
  },
}).createMachine({
  id: "intake",
  context: ({ input }) => input,
  initial: "preparing",
  states: {
    preparing: {
      type: "choice",
      choice: () => ({ target: "asking", input: { issueRef: "issue-1" } }),
    },
    asking: { invoke: { id: "classify", src: "classify", input: ({ input }) => input } },
  },
});

const savedMidIntake = Effect.fnUntraced(function* () {
  const workItem = yield* startWorkItem({ stages: { intake: intakeAskingForever } });
  return throughJson(workItem.save());
});

const intakeSnapshotIn = Effect.fnUntraced(function* (persisted: unknown) {
  const [intake] = yield* savedStagesOf(persisted);
  return intake?.snapshot;
});

describe("a saved work item", () => {
  it.effect("reads its running stage, that stage's running step and its state inputs", () =>
    Effect.gen(function* () {
      const persisted = yield* savedMidIntake();
      const stages = yield* savedStagesOf(persisted);
      const intake = yield* intakeSnapshotIn(persisted);
      expect(stages.map(({ id }) => id)).toStrictEqual(["intake"]);
      expect(yield* savedStepsOf(intake)).toStrictEqual([
        { id: "classify", src: "classify", task: { issueRef: "issue-1" } },
      ]);
      expect(yield* savedStateInputsOf(intake)).toStrictEqual({
        "intake.asking": { issueRef: "issue-1" },
      });
    }),
  );

  it.effect("reads back the task it was given for its running steps", () =>
    Effect.gen(function* () {
      const persisted = yield* withSavedStepTask(yield* savedMidIntake(), "intake", { other: 1 });
      const steps = yield* savedStepsOf(yield* intakeSnapshotIn(persisted));
      expect(steps.map(({ task }) => task)).toStrictEqual([{ other: 1 }]);
    }),
  );

  it.effect("reads back the input it was given for its active states", () =>
    Effect.gen(function* () {
      const persisted = yield* withSavedStateInput(yield* savedMidIntake(), "intake", {});
      const inputs = yield* savedStateInputsOf(yield* intakeSnapshotIn(persisted));
      expect(inputs).toStrictEqual({ "intake.asking": {} });
    }),
  );

  it.effect("keeps its running step when its stage context is replaced", () =>
    Effect.gen(function* () {
      const persisted = yield* withSavedStageContext(yield* savedMidIntake(), "intake", {});
      const intake = yield* intakeSnapshotIn(persisted);
      expect(intake).toMatchObject({ context: {} });
      expect((yield* savedStepsOf(intake)).map(({ id }) => id)).toStrictEqual(["classify"]);
    }),
  );

  it.effect("refuses to change a stage that is not running in it", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(withSavedStageContext(yield* savedMidIntake(), "ship", {}));
      expect(error).toMatchObject({ _tag: "SavedStageNotRunning", stage: "ship" });
    }),
  );
});
