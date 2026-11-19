import { Effect, Layer } from "effect";

import type { Classification, ClassifyTask } from "./classifier.ts";
import { Classifier, ClassifierGaveUp } from "./classifier.ts";
import type { Misbehaving } from "./fake-script.ts";
import { scriptedAnswers, scriptedPort } from "./fake-script.ts";

export type ClassifyStep = "classify";

interface ClassifyCall {
  readonly step: ClassifyStep;
  readonly task: ClassifyTask;
}

export interface FakeClassifierScript {
  /** What each classification returns, in order. */
  readonly results: readonly Classification[];
  readonly misbehaving?: Misbehaving<ClassifyStep> | undefined;
}

/** A classifier that follows a script instead of reading an issue. */
export const fakeClassifier = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const port = yield* scriptedPort<ClassifyStep, ClassifyCall, ClassifierGaveUp>({
    port: "classifier",
    steps: ["classify"],
    misbehaving: script.misbehaving,
    gaveUp: (message) => new ClassifierGaveUp({ message }),
  });
  const results = scriptedAnswers(script.results, "classifier");
  const classifier = Classifier.of({
    classify: (task) => port.run({ step: "classify", task }, results),
  });
  return {
    layer: Layer.succeed(Classifier, classifier),
    calls: (): readonly ClassifyTask[] => port.calls().map((call) => call.task),
    started: port.started,
  };
});
