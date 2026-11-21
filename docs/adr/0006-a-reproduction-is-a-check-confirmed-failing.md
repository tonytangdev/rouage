# A reproduction is a check confirmed failing before it counts

A bug's reproduction must be a check that can be run again, such as a failing test or a script, and Reproduce runs it in a separate step before the work item moves on. The `Reproducer` port first captures the reproduction and stores it behind a `reproductionRef` (ADR 0004). It then confirms the reproduction by running the check in the sandbox. Reproduce finishes with `reproduced` only when the check fails. When it passes, the stage fails with `ReproductionDidNotFail` and the work item becomes **Blocked**, because a check that does not fail usually means the bug was misunderstood, and a human should look before Build starts. A re-runnable check also lets later stages show the same check passing once the bug is fixed.

The port decides between `reproduced`, `needsSample` and `cannotReproduce`. The lifecycle's Reproduce loop limit is what stops a plugin that keeps asking for samples.

## Considered Options

- **One `reproduce` step that reports its own result.** Simpler, but the claim that the bug was reproduced would be taken on trust from the agent that made it.
- **Any evidence, such as a log or screenshot.** Rejected because nothing could check it again, before the fix or after.
- **Sending a passing check back to capture within an attempt budget, as Build does with fixes.** Deferred until real plugins show that a second capture often succeeds.

## Consequences

- Every Reproducer plugin must produce something it can run again, and run it on request.
- `confirm` can later move to its own port, so that a Script plugin runs the check without AI.
