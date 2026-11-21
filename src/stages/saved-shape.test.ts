import { describe, it } from "@effect/vitest";
import { Effect, Record } from "effect";

import { defaultLifecycle } from "../lifecycle/lifecycle.ts";
import { expectPinned, pinName } from "../lifecycle/saved-shape-pin.ts";
import { stageSavedShape } from "../lifecycle/saved-shape.ts";
import { realStages } from "./real-stages.ts";

const { version } = defaultLifecycle;

describe("the saved shape of Rouage's stage machines", () => {
  it.effect("matches the pin of the default lifecycle's version", () =>
    Effect.gen(function* () {
      const { stages } = yield* realStages();
      const shape = { version, stages: Record.map(stages, stageSavedShape) };
      yield* expectPinned(
        shape,
        import.meta.dirname,
        `A work item saved under lifecycle version ${version} while one of these stages ran would no longer restore as it did. Once Rouage is published, bump the version in lifecycle.ts, which writes a new pin, keep src/stages/${pinName(version)} as it is and add a migration from it; before that, update the pin with \`pnpm test -u\` (ADR 0002, ADR 0015, ADR 0016)`,
      );
    }),
  );
});
