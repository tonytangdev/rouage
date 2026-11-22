# Build confirms a reproduction passes, within its fix budget

For a bug, Build finishes with `built` only once the check behind `reproductionRef` passes in the sandbox, because a check confirmed failing before the change (ADR 0006) is only evidence of a fix once something runs it again after the change, and the builder's own test report would take that on trust from the agent that made the change. The check belongs to Build, which every bug passes through, not to Demo, which Plan may skip (#11), nor to Review, which then judges a change whose reproduction already passes.

The `Builder` port runs the check in a `checkReproduction` step of its own, after the builder's tests pass. A reproduction that still fails is handled like a failing test: its output goes to `fix`, then the tests and the check run again, and each round counts against the same fix-attempt budget. A bug that reaches Build without a reproduction fails the stage, so no bug is built without evidence of its fix; any work item that reaches Build without a sandbox fails it too, since every step of Build works in the sandbox (#52).

## Considered Options

- **Trust the builder's `test` step to include the reproduction.** Rejected for the reason ADR 0006 rejected a single `reproduce` step: the claim would rest on the agent that made it.
- **A port shared by Reproduce and Build that runs checks, so a Script plugin runs them without AI.** Deferred: it means reworking Reproduce and adding the first port that belongs to no stage folder (ADR 0003), and no Script plugin needs it yet.
- **Fail Build at once, or give the reproduction its own budget.** Rejected: to the builder a reproduction still failing is one more failing test, and one budget keeps `ROUAGE_MAX_BUILD_FIXES` meaning one thing.

## Consequences

- Every Builder plugin must run a reproduction it did not write, on request, in the work item's sandbox.
