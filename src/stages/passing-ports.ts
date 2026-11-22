import { Effect, Layer } from "effect";

import { passingBuilder } from "./build/build-harness.ts";
import { passingDemonstrator } from "./demo/demo-harness.ts";
import { passingClassifier } from "./intake/intake-harness.ts";
import { passingPlanner } from "./plan/plan-harness.ts";
import { passingProvisionPorts } from "./provision/provision-harness.ts";
import { passingReproducer } from "./reproduce/reproduce-harness.ts";
import { passingReviewer } from "./review/review-harness.ts";
import { passingShipper } from "./ship/ship-harness.ts";
import { passingSpecWriter } from "./spec/spec-harness.ts";

/** A fake for every port Rouage's stage machines run on, each following its stage's passing script, with the reviewer's fake to read what it was asked. */
export const passingPorts = Effect.gen(function* () {
  const review = yield* passingReviewer;
  const layer = Layer.mergeAll(
    (yield* passingClassifier).layer,
    (yield* passingSpecWriter).layer,
    (yield* passingProvisionPorts).layer,
    (yield* passingReproducer).layer,
    (yield* passingPlanner).layer,
    (yield* passingBuilder).layer,
    (yield* passingDemonstrator).layer,
    review.layer,
    (yield* passingShipper).layer,
  );
  return { review, layer };
});
