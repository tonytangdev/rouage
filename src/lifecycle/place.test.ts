import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { UnknownPlace, placeOfState } from "./place.ts";

describe("the place a state value names", () => {
  it.effect("is the stage or gate inside the working state", () =>
    Effect.sync(() => {
      expect(placeOfState({ working: "shipGate" })).toStrictEqual("shipGate");
    }),
  );

  it.effect("is refused with UnknownPlace when the value names no place", () =>
    Effect.sync(() => {
      expect(() => placeOfState({ working: { build: "testing" } })).toThrow(UnknownPlace);
    }),
  );
});
