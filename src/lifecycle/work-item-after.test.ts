import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { noFactsYet } from "./facts.ts";
import { defaultGatekeepers } from "./gatekeepers.ts";
import { StageFailure } from "./stage.ts";
import type { BlockingTransition, LoopingTransition, OnwardTransition } from "./transition.ts";
import { errored, finished } from "./transition.ts";
import type { AroundLoop, BlockedContext } from "./work-item-after.ts";
import { workItemAfter } from "./work-item-after.ts";
import type { WorkItemContext } from "./work-item.ts";

const by = { by: "ana", at: "2026-01-01T00:00:00.000Z" };

const fresh: WorkItemContext = {
  id: "wi-1",
  facts: { issueRef: "#1", ...noFactsYet },
  limits: { review: 2, reproduce: 2, ship: 2 },
  counters: { review: 0, reproduce: 0, ship: 0 },
  gatekeepers: defaultGatekeepers,
  blocked: null,
  decisions: [],
};

const standing: WorkItemContext = {
  ...fresh,
  facts: {
    ...fresh.facts,
    feedback: "from the last rejection",
    changeRequest: { from: "review", text: "rename totals" },
    demoOverride: true,
  },
};

const blockedOnSpec: WorkItemContext = {
  ...standing,
  counters: { review: 2, reproduce: 1, ship: 0 },
  blocked: { from: "spec", reason: { tag: "AgentTimedOut", message: "no answer" } },
};

interface Case<Kind, After> {
  readonly from: WorkItemContext;
  readonly transition: Kind;
  readonly to: After;
}

const onwardCases: ReadonlyArray<readonly [string, Case<OnwardTransition, WorkItemContext>]> = [
  [
    "a plan records whether it calls for a demo",
    {
      from: fresh,
      transition: finished("plan", { _tag: "planned", planRef: "plan-1", demo: true }),
      to: { ...fresh, facts: { ...fresh.facts, planRef: "plan-1", demoPlanned: true } },
    },
  ],
  [
    "a new demo replaces the outdated one",
    {
      from: { ...fresh, facts: { ...fresh.facts, demoRef: "demo-1", demoOutdated: true } },
      transition: finished("demo", { _tag: "demonstrated", demoRef: "demo-2" }),
      to: { ...fresh, facts: { ...fresh.facts, demoRef: "demo-2", demoOutdated: false } },
    },
  ],
  [
    "a build outdates the latest demo",
    {
      from: { ...fresh, facts: { ...fresh.facts, demoRef: "demo-1" } },
      transition: finished("build", { _tag: "built" }),
      to: { ...fresh, facts: { ...fresh.facts, demoRef: "demo-1", demoOutdated: true } },
    },
  ],
  [
    "a gate approval only records the decision",
    {
      from: standing,
      transition: { _tag: "gateApproved", gate: "specGate", decision: by },
      to: {
        ...standing,
        decisions: [{ action: "approve", state: "specGate", ...by, comment: null }],
      },
    },
  ],
  [
    "a ship gate rejection makes the comment the change request",
    {
      from: standing,
      transition: {
        _tag: "gateRejected",
        gate: "shipGate",
        decision: { ...by, comment: "exclude VAT" },
      },
      to: {
        ...standing,
        facts: {
          ...standing.facts,
          feedback: "exclude VAT",
          changeRequest: { from: "shipGate", text: "exclude VAT" },
        },
        decisions: [{ action: "reject", state: "shipGate", ...by, comment: "exclude VAT" }],
      },
    },
  ],
  [
    "a sample gate rejection keeps the change request",
    {
      from: standing,
      transition: {
        _tag: "gateRejected",
        gate: "sampleGate",
        decision: { ...by, comment: "no emails" },
      },
      to: {
        ...standing,
        facts: { ...standing.facts, feedback: "no emails" },
        decisions: [{ action: "reject", state: "sampleGate", ...by, comment: "no emails" }],
      },
    },
  ],
  [
    "a spec gate rejection drops the change request and the demo override",
    {
      from: standing,
      transition: {
        _tag: "gateRejected",
        gate: "specGate",
        decision: { ...by, comment: "narrow it" },
      },
      to: {
        ...standing,
        facts: {
          ...standing.facts,
          feedback: "narrow it",
          changeRequest: null,
          demoOverride: null,
        },
        decisions: [{ action: "reject", state: "specGate", ...by, comment: "narrow it" }],
      },
    },
  ],
  [
    "a retry without a comment unblocks with fresh loop counters and keeps the facts",
    {
      from: blockedOnSpec,
      transition: { _tag: "retried", decision: by },
      to: {
        ...standing,
        decisions: [{ action: "retry", state: "blocked", ...by, comment: null }],
      },
    },
  ],
  [
    "a retry with a comment replaces only the feedback",
    {
      from: blockedOnSpec,
      transition: { _tag: "retried", decision: { ...by, comment: "try again" } },
      to: {
        ...standing,
        facts: { ...standing.facts, feedback: "try again" },
        decisions: [{ action: "retry", state: "blocked", ...by, comment: "try again" }],
      },
    },
  ],
  [
    "sending back to Spec unblocks and drops the change request and the demo override",
    {
      from: blockedOnSpec,
      transition: { _tag: "sentBackToSpec", decision: { ...by, comment: "narrow it" } },
      to: {
        ...standing,
        facts: {
          ...standing.facts,
          feedback: "narrow it",
          changeRequest: null,
          demoOverride: null,
        },
        decisions: [{ action: "backToSpec", state: "blocked", ...by, comment: "narrow it" }],
      },
    },
  ],
  [
    "a demo override changes only the override, and records where it was made",
    {
      from: standing,
      transition: { _tag: "demoOverridden", demo: false, state: "plan", decision: by },
      to: {
        ...standing,
        facts: { ...standing.facts, demoOverride: false },
        decisions: [{ action: "skipDemo", state: "plan", ...by, comment: null }],
      },
    },
  ],
  [
    "a cancellation only records the decision",
    {
      from: standing,
      transition: { _tag: "cancelled", state: "build", decision: by },
      to: {
        ...standing,
        decisions: [{ action: "cancel", state: "build", ...by, comment: null }],
      },
    },
  ],
];

const loopingCases: ReadonlyArray<readonly [string, Case<LoopingTransition, AroundLoop>]> = [
  [
    "a review asking for changes counts a trip and sends them to Build",
    {
      from: fresh,
      transition: finished("review", { _tag: "changesRequested", feedback: "rename totals" }),
      to: {
        _tag: "sentAround",
        around: {
          ...fresh,
          facts: {
            ...fresh.facts,
            feedback: "rename totals",
            changeRequest: { from: "review", text: "rename totals" },
          },
          counters: { ...fresh.counters, review: 1 },
        },
      },
    },
  ],
  [
    "Ship failing to land the change sends what kept it back to Build",
    {
      from: fresh,
      transition: finished("ship", { _tag: "needsRebuild", feedback: "conflicts" }),
      to: {
        _tag: "sentAround",
        around: {
          ...fresh,
          facts: {
            ...fresh.facts,
            feedback: "conflicts",
            changeRequest: { from: "ship", text: "conflicts" },
          },
          counters: { ...fresh.counters, ship: 1 },
        },
      },
    },
  ],
  [
    "a loop at its limit blocks, clears the feedback and keeps the change request",
    {
      from: { ...standing, counters: { ...fresh.counters, review: 2 } },
      transition: finished("review", { _tag: "changesRequested", feedback: "again" }),
      to: {
        _tag: "blocked",
        blocked: {
          ...standing,
          facts: { ...standing.facts, feedback: null },
          counters: { ...fresh.counters, review: 2 },
          blocked: {
            from: "review",
            reason: {
              tag: "LoopLimitReached",
              message: "Review sent the change back to Build 2 times, and last asked: again",
            },
          },
        },
      },
    },
  ],
  [
    "Reproduce asking for a sample at its limit blocks and keeps the sample request",
    {
      from: { ...fresh, counters: { ...fresh.counters, reproduce: 2 } },
      transition: finished("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" }),
      to: {
        _tag: "blocked",
        blocked: {
          ...fresh,
          facts: { ...fresh.facts, sampleRequest: "orders over 100" },
          counters: { ...fresh.counters, reproduce: 2 },
          blocked: {
            from: "reproduce",
            reason: {
              tag: "LoopLimitReached",
              message: "Reproduce went back to Provision 2 times",
            },
          },
        },
      },
    },
  ],
];

const blockingCases: ReadonlyArray<readonly [string, Case<BlockingTransition, BlockedContext>]> = [
  [
    "a stage error blocks on the stage with its failure reason",
    {
      from: standing,
      transition: errored(
        "spec",
        new StageFailure({ reason: { tag: "AgentTimedOut", message: "no answer" } }),
      ),
      to: {
        ...standing,
        blocked: { from: "spec", reason: { tag: "AgentTimedOut", message: "no answer" } },
      },
    },
  ],
  [
    "a reproduction whose check passed blocks and is kept",
    {
      from: fresh,
      transition: finished("reproduce", {
        _tag: "checkPassed",
        reproductionRef: "repro-1",
        output: "1 passed",
      }),
      to: {
        ...fresh,
        facts: { ...fresh.facts, reproductionRef: "repro-1" },
        blocked: {
          from: "reproduce",
          reason: {
            tag: "ReproductionDidNotFail",
            message: "The reproduction repro-1 passed, so it does not show the bug: 1 passed",
          },
        },
      },
    },
  ],
];

describe("work item after a transition", () => {
  for (const [title, { from, transition, to }] of onwardCases) {
    it.effect(title, () =>
      Effect.sync(() => {
        expect(workItemAfter(from, transition)).toStrictEqual(to);
      }),
    );
  }

  for (const [title, { from, transition, to }] of loopingCases) {
    it.effect(title, () =>
      Effect.sync(() => {
        expect(workItemAfter(from, transition)).toStrictEqual(to);
      }),
    );
  }

  for (const [title, { from, transition, to }] of blockingCases) {
    it.effect(title, () =>
      Effect.sync(() => {
        expect(workItemAfter(from, transition)).toStrictEqual(to);
      }),
    );
  }
});
