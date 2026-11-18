import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { toggleTimes } from "./toggle.ts";

describe("toggleTimes", () => {
  it.effect("counts each entry into the active state", () =>
    Effect.gen(function* () {
      const count = yield* Effect.scoped(toggleTimes(3));
      expect(count).toStrictEqual(2);
    }),
  );
});
