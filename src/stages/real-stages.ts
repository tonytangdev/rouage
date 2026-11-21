import { Effect } from "effect";

import { buildUnderTest } from "./build/build-harness.ts";
import { demoUnderTest } from "./demo/demo-harness.ts";
import { intakeUnderTest } from "./intake/intake-harness.ts";
import { planUnderTest } from "./plan/plan-harness.ts";
import { provisionUnderTest } from "./provision/provision-harness.ts";
import { reproduceUnderTest } from "./reproduce/reproduce-harness.ts";
import { reviewUnderTest } from "./review/review-harness.ts";
import { shipUnderTest } from "./ship/ship-harness.ts";
import { specUnderTest } from "./spec/spec-harness.ts";

/** Every one of Rouage's stage machines, each built on a fake port following its passing script, with the Review stage's fake to read what it was asked. */
export const realStages = Effect.fnUntraced(function* () {
  const review = yield* reviewUnderTest.scripted(reviewUnderTest.passing());
  return {
    review,
    stages: {
      intake: (yield* intakeUnderTest.scripted(intakeUnderTest.passing())).stage,
      spec: (yield* specUnderTest.scripted(specUnderTest.passing())).stage,
      provision: (yield* provisionUnderTest.scripted(provisionUnderTest.passing())).stage,
      reproduce: (yield* reproduceUnderTest.scripted(reproduceUnderTest.passing())).stage,
      plan: (yield* planUnderTest.scripted(planUnderTest.passing())).stage,
      build: (yield* buildUnderTest.scripted(buildUnderTest.passing())).stage,
      demo: (yield* demoUnderTest.scripted(demoUnderTest.passing())).stage,
      review: review.stage,
      ship: (yield* shipUnderTest.scripted(shipUnderTest.passing())).stage,
    },
  };
});
