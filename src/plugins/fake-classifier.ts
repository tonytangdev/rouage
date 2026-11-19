import { Deferred, Effect, Layer } from "effect";

import type { Classification, ClassifyTask } from "./classifier.ts";
import { Classifier, ClassifyFailed } from "./classifier.ts";

export interface FakeClassifierScript {
  /** What each classification returns, in order. */
  readonly results: readonly Classification[];
  /** Fails with `ClassifyFailed` every time it classifies. */
  readonly failing?: boolean;
  /** Dies with a defect every time it classifies. */
  readonly crashing?: boolean;
  /** Never finishes classifying, so a test can save or stop the work item while it runs. */
  readonly hanging?: boolean;
}

const verdictOf = (script: FakeClassifierScript, result: Effect.Effect<Classification>) => {
  if (script.failing === true) {
    return Effect.fail(new ClassifyFailed({ message: "The classifier gave up on the issue" }));
  }
  if (script.crashing === true) {
    return Effect.die(new Error("The classifier exited while classifying"));
  }
  return script.hanging === true ? Effect.never : result;
};

/**
 * A classifier that follows a script instead of reading an issue. A
 * classification beyond the script dies, so a test that under-scripts its
 * classifier fails loudly.
 */
export const fakeClassifier = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const calls: ClassifyTask[] = [];
  const results = [...script.results];
  const begun = yield* Deferred.make<boolean>();
  const nextResult = Effect.suspend(() => {
    const result = results.shift();
    return result === undefined
      ? Effect.die(new Error("The fake classifier ran out of scripted results"))
      : Effect.succeed(result);
  });
  const classifier = Classifier.of({
    classify: (task) =>
      Effect.suspend(() => {
        calls.push(task);
        return Deferred.succeed(begun, true).pipe(Effect.andThen(verdictOf(script, nextResult)));
      }),
  });
  return {
    layer: Layer.succeed(Classifier, classifier),
    calls: (): readonly ClassifyTask[] => calls,
    started: Deferred.await(begun).pipe(Effect.asVoid),
  };
});
