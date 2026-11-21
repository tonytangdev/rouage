# The lifecycle tears down a work item's sandbox at least once, through a port it owns

A sandbox lives from Provision until its work item is shipped or cancelled, and ADR 0001 requires its sample to be destroyed with it. Ending the sandbox is therefore the lifecycle's concern, not one stage's, so the lifecycle owns a `SandboxTeardown` port in `src/lifecycle/`. `createWorkItem` and `restoreWorkItem` require it, and `Provisioner` keeps only `provision`. A Sandbox plugin fills both ports.

The work item runtime calls `teardown({ workItemId })` whenever it sees a work item in a final state: when a running work item reaches `shipped` or `cancelled`, and when a restored snapshot is already final. A crash between saving the final snapshot and finishing teardown then leaks nothing for good. Teardown is keyed by work item ID alone and never reads `sandboxRef`, because a work item cancelled mid-Provision may have a sandbox that was never reported (ADR 0005).

## Contract for the plugin

- Teardown is idempotent: tearing down a work item with no live sandbox succeeds.
- A teardown may arrive while an interrupted `provision` for the same work item is still unwinding. The plugin must make the pair end with no live sandbox, for example by serialising calls per work item ID.

## When teardown gives up

The work item is final and cannot become Blocked. The runtime retries with exponential backoff, the attempt count read from `Config`, then logs the failure. `WorkItem.tornDown` completes when teardown succeeds and fails with `TeardownGaveUp` when retries run out, so a caller can report a leaked sandbox. Closing the work item's scope waits for a teardown in flight instead of interrupting it, because callers usually close the scope right after the final state, and nobody restores a shipped work item to retry.

## Considered Options

- **A generic end-of-work-item hook that the runtime calls.** Rejected: it leaves the ADR 0001 guarantee to every factory builder to wire up.
- **Moving the whole `Provisioner` into `src/lifecycle/`.** Rejected: it breaks ADR 0003, under which a stage's port lives with its stage.
- **Recording a "torn down" fact so teardown runs exactly once.** Rejected: final states take no events, and idempotence makes a repeated teardown harmless.
- **The runtime waiting for the stage's interrupted fibers before tearing down.** Rejected: those fibers are hidden inside `portStage`, and the Provisioner already tracks sandboxes per work item ID, so serialising there costs little.
