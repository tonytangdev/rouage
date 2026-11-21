import { describe, expect, it } from "@effect/vitest";
import { Effect, Record } from "effect";

import { defaultLifecycle } from "../lifecycle/lifecycle.ts";
import { expectPinned } from "../lifecycle/saved-shape-pin.ts";
import { stageSavedShape } from "../lifecycle/saved-shape.ts";
import { realStages } from "./real-stages.ts";

const { version } = defaultLifecycle;

const savedShapes = Effect.gen(function* () {
  const { stages } = yield* realStages();
  return Record.map(stages, stageSavedShape);
});

describe("the saved shape of Rouage's stage machines", () => {
  it.effect("matches the pin of the default lifecycle's version", () =>
    Effect.gen(function* () {
      const shape = { version, stages: yield* savedShapes };
      yield* expectPinned(
        shape,
        import.meta.dirname,
        `A work item saved under lifecycle version ${version} while one of these stages ran`,
      );
    }),
  );

  // A context or task without an Effect Schema is pinned as null, which would hide its changes.
  it.effect("declares every context and step task with an Effect Schema", () =>
    Effect.gen(function* () {
      const undeclared = Object.entries(yield* savedShapes).flatMap(([stage, { context, steps }]) =>
        [
          [`${stage} context`, context] as const,
          ...Object.entries(steps).map(([step, task]) => [`${stage} ${step} task`, task] as const),
        ].flatMap(([what, schema]) => (schema === null ? [what] : [])),
      );
      expect(undeclared).toStrictEqual([]);
    }),
  );
});
