import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { StageNotRunning, startWorkItem } from "./lifecycle-harness.ts";

describe("lifecycle harness", () => {
  it.effect("fails at once when a test finishes a stage the work item is not in", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      expect(() => {
        workItem.finish("spec", { _tag: "written" });
      }).toThrow(StageNotRunning);
    }),
  );
});
