import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { ChangeRequest } from "./change-request.ts";
import type { AnyOutcome, FactEvent } from "./fact-event.ts";
import { finished } from "./fact-event.ts";
import { factsAfter, noFactsYet } from "./facts.ts";

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

const standing = {
  ...before,
  feedback: "from the last rejection",
  changeRequest: { from: "review", text: "rename totals" },
  demoOverride: true,
} as const;

interface Lifetime {
  readonly event: FactEvent;
  readonly feedback: string | null;
  readonly changeRequest: ChangeRequest | null;
  readonly demoOverride: boolean | null;
}

const lifetimes: ReadonlyArray<readonly [string, Lifetime]> = [
  [
    "a retry without a comment keeps them all",
    {
      event: { _tag: "retried", comment: null },
      feedback: standing.feedback,
      changeRequest: standing.changeRequest,
      demoOverride: true,
    },
  ],
  [
    "a retry with a comment replaces only the feedback",
    {
      event: { _tag: "retried", comment: "try again" },
      feedback: "try again",
      changeRequest: standing.changeRequest,
      demoOverride: true,
    },
  ],
  [
    "a return to Spec drops the change request and the demo override",
    {
      event: { _tag: "returnedToSpec", comment: "narrow it" },
      feedback: "narrow it",
      changeRequest: null,
      demoOverride: null,
    },
  ],
  [
    "a loop reaching its limit clears the feedback and keeps the change request",
    {
      event: { _tag: "loopExhausted", outcome: { _tag: "changesRequested", feedback: "again" } },
      feedback: null,
      changeRequest: standing.changeRequest,
      demoOverride: true,
    },
  ],
  [
    "a ship gate rejection makes the comment the change request",
    {
      event: { _tag: "gateRejected", gate: "shipGate", comment: "exclude VAT" },
      feedback: "exclude VAT",
      changeRequest: { from: "shipGate", text: "exclude VAT" },
      demoOverride: true,
    },
  ],
  [
    "a sample gate rejection keeps the change request",
    {
      event: { _tag: "gateRejected", gate: "sampleGate", comment: "no emails" },
      feedback: "no emails",
      changeRequest: standing.changeRequest,
      demoOverride: true,
    },
  ],
  [
    "a demo override changes only the override",
    {
      event: { _tag: "demoOverridden", demo: false },
      feedback: standing.feedback,
      changeRequest: standing.changeRequest,
      demoOverride: false,
    },
  ],
];

describe("facts", () => {
  for (const [title, { event, ...expected }] of lifetimes) {
    it.effect(`after ${title}`, () =>
      Effect.sync(() => {
        const { feedback, changeRequest, demoOverride } = factsAfter(standing, event);
        expect({ feedback, changeRequest, demoOverride }).toStrictEqual(expected);
      }),
    );
  }

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
