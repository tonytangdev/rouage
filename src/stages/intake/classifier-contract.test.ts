import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { howBroken } from "../plugin-contract.ts";
import { classifierContract, describeClassifierContract } from "./classifier-contract.ts";
import type { Classification } from "./classifier.ts";
import { fakeClassifier } from "./fake-classifier.ts";
import { firstClassify, isUnclear } from "./intake-harness.ts";

const classifierAnswering = (result: Classification) =>
  Layer.unwrap(Effect.map(fakeClassifier({ results: [result] }), (fake) => fake.layer));

describeClassifierContract("the fake classifier", classifierAnswering(isUnclear), firstClassify);

describe("the classifier contract against a classifier that breaks it", () => {
  it.effect("fails when the classifier judges an issue unclear without a reason", () =>
    Effect.gen(function* () {
      const error = yield* howBroken(
        classifierContract(firstClassify).answersWithAClassification,
        classifierAnswering({ _tag: "unclear", reason: "" }),
      );
      expect(error).toMatchObject({ _tag: "PluginBrokeContract" });
    }),
  );
});
