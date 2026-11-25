import type { Layer } from "effect";
import { Effect, Schema } from "effect";

import type { PluginPromise } from "../plugin-contract.ts";
import { describePluginContract, promiseKept } from "../plugin-contract.ts";
import type { ClassifyTask } from "./classifier.ts";
import { ClassificationSchema, Classifier } from "./classifier.ts";

const isClassification = Schema.is(ClassificationSchema);

/** The promises of the Classifier port, each a check classifying `task`, an issue the classifier can read. */
export const classifierContract = (task: ClassifyTask) =>
  ({
    answersWithAClassification: {
      name: "answers with a classification its schema accepts, so an unclear one carries a reason",
      check: Effect.gen(function* () {
        const classifier = yield* Classifier;
        const classification = yield* classifier.classify(task);
        yield* promiseKept(
          isClassification(classification),
          `The classifier answered ${JSON.stringify(classification)}, which is no Classification`,
        );
      }),
    },
  }) satisfies Record<string, PluginPromise<Classifier>>;

/** Declares the classifier contract's tests for the Classifier `layer` fills, classifying `task`. */
export const describeClassifierContract = <E>(
  title: string,
  layer: Layer.Layer<Classifier, E>,
  task: ClassifyTask,
) => {
  describePluginContract(`classifier contract, ${title}`, classifierContract(task), layer);
};
