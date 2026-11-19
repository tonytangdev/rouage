import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { resolveLoopLimits } from "./loop-limits.ts";

const withEnv = (env: Record<string, string>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)));

describe("resolveLoopLimits", () => {
  it.effect("allows three trips around each loop when nothing is configured", () =>
    Effect.gen(function* () {
      const limits = yield* resolveLoopLimits().pipe(withEnv({}));
      expect(limits).toStrictEqual({ review: 3, reproduce: 3 });
    }),
  );

  it.effect("reads each limit from its environment variable", () =>
    Effect.gen(function* () {
      const limits = yield* resolveLoopLimits().pipe(
        withEnv({ ROUAGE_MAX_REVIEW_LOOPS: "5", ROUAGE_MAX_REPRODUCE_LOOPS: "1" }),
      );
      expect(limits).toStrictEqual({ review: 5, reproduce: 1 });
    }),
  );

  it.effect("lets an explicit option win over the environment variable", () =>
    Effect.gen(function* () {
      const limits = yield* resolveLoopLimits({ review: 7 }).pipe(
        withEnv({ ROUAGE_MAX_REVIEW_LOOPS: "5", ROUAGE_MAX_REPRODUCE_LOOPS: "1" }),
      );
      expect(limits).toStrictEqual({ review: 7, reproduce: 1 });
    }),
  );
});
