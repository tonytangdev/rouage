import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { ChangeRequest } from "./change-request.ts";
import type { AnyOutcome } from "./fact-event.ts";
import { finished } from "./fact-event.ts";
import { factsAfter } from "./facts.ts";
import { noFactsYet } from "./stage.ts";

const before = { issueRef: "#1", ...noFactsYet };

interface SentBack {
  readonly outcome: AnyOutcome;
  readonly feedback: string;
  readonly changeRequest: ChangeRequest;
}

const sendingBackToBuild: readonly SentBack[] = [
  {
    outcome: { _tag: "changesRequested", feedback: "rename totals" },
    feedback: "rename totals",
    changeRequest: { from: "review", text: "rename totals" },
  },
];

describe("facts", () => {
  for (const { outcome, feedback, changeRequest } of sendingBackToBuild) {
    it.effect(`gives Build the feedback and change request of ${outcome._tag}`, () =>
      Effect.sync(() => {
        const after = factsAfter(before, finished(outcome));
        expect({ feedback: after.feedback, changeRequest: after.changeRequest }).toStrictEqual({
          feedback,
          changeRequest,
        });
      }),
    );
  }
});
