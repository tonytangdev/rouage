import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { perLoop, resolveLoopLimits } from "./loops.ts";

const withEnv = (env: Record<string, string>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)));

describe("loops", () => {
  it.effect("allows three trips around each loop when nothing is configured", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveLoopLimits().pipe(withEnv({}));
      expect(resolved).toStrictEqual(perLoop(() => 3));
    }),
  );

  it.effect("reads each limit from its environment variable", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveLoopLimits().pipe(
        withEnv({
          ROUAGE_MAX_REVIEW_LOOPS: "5",
          ROUAGE_MAX_REPRODUCE_LOOPS: "1",
          ROUAGE_MAX_SHIP_LOOPS: "2",
        }),
      );
      expect(resolved).toMatchObject({ review: 5, reproduce: 1, ship: 2 });
    }),
  );

  it.effect("lets an explicit option win over the environment variable", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveLoopLimits({ review: 7 }).pipe(
        withEnv({ ROUAGE_MAX_REVIEW_LOOPS: "5", ROUAGE_MAX_REPRODUCE_LOOPS: "1" }),
      );
      expect(resolved).toMatchObject({ review: 7, reproduce: 1 });
    }),
  );
});
