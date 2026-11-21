import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItemAt } from "./lifecycle-harness.ts";

describe("a loop reaching its limit", () => {
  it.effect("keeps the sample request Reproduce last made", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
      const askForSample = (sampleRequest: string) => {
        workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
        workItem.finish("reproduce", { _tag: "needsSample", sampleRequest });
      };
      askForSample("orders over 100");
      askForSample("orders over 100");
      askForSample("orders over 100");
      askForSample("orders over 500");
      expect(workItem.state()).toStrictEqual("blocked");
      expect(workItem.context().facts.sampleRequest).toStrictEqual("orders over 500");
    }),
  );

  it.effect(
    "shows the human the changes Review last requested, rather than feeding them back",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("build", { demo: false });
        const requestChanges = (feedback: string) => {
          workItem.finish("build", { _tag: "built" });
          workItem.finish("review", { _tag: "changesRequested", feedback });
        };
        requestChanges("rename the flag");
        requestChanges("rename the flag");
        requestChanges("rename the flag");
        requestChanges("drop the flag");
        expect(workItem.context().blocked?.reason.message).toStrictEqual(
          "Review sent the change back to Build 3 times, and last asked: drop the flag",
        );
        expect(workItem.context().facts.feedback).toBeNull();
      }),
  );
});
