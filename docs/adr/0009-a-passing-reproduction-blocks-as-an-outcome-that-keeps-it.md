# A passing reproduction blocks as an outcome that keeps it

Its decision supersedes the part of [ADR 0006](0006-a-reproduction-is-a-check-confirmed-failing.md) where a passing check makes Reproduce fail; the rest of ADR 0006 stands.

When the check of a captured reproduction passes, Reproduce finishes with a `checkPassed` outcome carrying the reproduction's reference and what the check printed, instead of failing. The lifecycle routes it to **Blocked** with reason `ReproductionDidNotFail`, as it routes `cannotReproduce`, and stores the reference in `reproductionRef`. A failed stage reports nothing, so the reproduction was lost, and a retry, even one carrying the human's **Feedback** (#20), captured from scratch instead of revising it. `reproductionRef` can therefore name a reproduction that does not fail while the work item is blocked. Plan and Build still see only a confirmed one, because every way out of Blocked runs Reproduce again before Plan, and lifecycle tests hold that.

## Considered Options

- **A separate fact for the unconfirmed reproduction.** Keeps `reproductionRef` always confirmed as a property of the data rather than the routing, at the cost of a fact every stage sees but only Reproduce reads.
- **The Reproducer finds its last capture by work item ID**, as the Provisioner does with sandboxes. Puts state-keeping on every Reproducer plugin, unlike the reference-based contract of ADR 0004.
- **Keep nothing, and rely on the retry's feedback.** Throws away a capture that is usually close to right.

## Consequences

- A lifecycle that a user extends or replaces must run Reproduce again on every path from a `ReproductionDidNotFail` block to Plan.
