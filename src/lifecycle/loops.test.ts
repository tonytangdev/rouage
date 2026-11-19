import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import {
  goneAround,
  loopExhausted,
  loopLimitReached,
  noLoopsYet,
  resolveLoopLimits,
} from "./loops.ts";

const withEnv = (env: Record<string, string>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)));

const limits = { review: 2, reproduce: 2 };

describe("loops", () => {
  it.effect("allows three trips around each loop when nothing is configured", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveLoopLimits().pipe(withEnv({}));
      expect(resolved).toStrictEqual({ review: 3, reproduce: 3 });
    }),
  );

  it.effect("reads each limit from its environment variable", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveLoopLimits().pipe(
        withEnv({ ROUAGE_MAX_REVIEW_LOOPS: "5", ROUAGE_MAX_REPRODUCE_LOOPS: "1" }),
      );
      expect(resolved).toStrictEqual({ review: 5, reproduce: 1 });
    }),
  );

  it.effect("lets an explicit option win over the environment variable", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveLoopLimits({ review: 7 }).pipe(
        withEnv({ ROUAGE_MAX_REVIEW_LOOPS: "5", ROUAGE_MAX_REPRODUCE_LOOPS: "1" }),
      );
      expect(resolved).toStrictEqual({ review: 7, reproduce: 1 });
    }),
  );

  it.effect("counts one loop without touching the other", () =>
    Effect.sync(() => {
      expect(goneAround({ limits, counters: noLoopsYet }, "review")).toStrictEqual({
        counters: { review: 1, reproduce: 0 },
      });
    }),
  );

  it.effect("is not exhausted while trips remain under the limit", () =>
    Effect.sync(() => {
      expect(loopExhausted({ limits, counters: { review: 1, reproduce: 0 } }, "review")).toBe(
        false,
      );
    }),
  );

  it.effect("is exhausted once the trips reach the limit", () =>
    Effect.sync(() => {
      expect(loopExhausted({ limits, counters: { review: 2, reproduce: 0 } }, "review")).toBe(true);
    }),
  );

  it.effect("blocks on the loop's stage with the limit in the message", () =>
    Effect.sync(() => {
      expect(loopLimitReached({ limits, counters: noLoopsYet }, "reproduce")).toStrictEqual({
        blocked: {
          from: "reproduce",
          reason: { tag: "LoopLimitReached", message: "Reproduce went back to Provision 2 times" },
        },
      });
    }),
  );
});
