import { Deferred, Effect, Layer } from "effect";

import type { Classification, ClassifyTask } from "./classifier.ts";
import { Classifier, ClassifierGaveUp } from "./classifier.ts";
import type { Misbehaviour } from "./fake-script.ts";
import { behaving, scriptedAnswers } from "./fake-script.ts";

export interface FakeClassifierScript {
  /** What each classification returns, in order. */
  readonly results: readonly Classification[];
  /** How every classification goes wrong, if it does. */
  readonly misbehaving?: Misbehaviour;
}

const wrongdoing = {
  gaveUp: new ClassifierGaveUp({ message: "The classifier gave up on the issue" }),
  defect: "The classifier exited while classifying",
};

/** A classifier that follows a script instead of reading an issue. */
export const fakeClassifier = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const calls: ClassifyTask[] = [];
  const results = scriptedAnswers(script.results, "classifier");
  const begun = yield* Deferred.make<boolean>();
  const classifier = Classifier.of({
    classify: (task) =>
      Effect.suspend(() => {
        calls.push(task);
        return Deferred.succeed(begun, true).pipe(
          Effect.andThen(behaving(script.misbehaving, wrongdoing, results)),
        );
      }),
  });
  return {
    layer: Layer.succeed(Classifier, classifier),
    calls: (): readonly ClassifyTask[] => calls,
    started: Deferred.await(begun).pipe(Effect.asVoid),
  };
});
