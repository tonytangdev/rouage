# A sample run waits at a sample gate

When the user must run an extraction script under **Schema access** (ADR 0001), the work item waits at a `sampleGate` instead of becoming **Blocked** (ADR 0005), because a routine wait read like a failure and `retry` reset every loop counter, so the Reproduce loop limit could never trip under schema access.

Provision finishes with an `awaitingRun` outcome carrying the sandbox and the script references, and the lifecycle routes it to a `sampleGate`. `approve` means the user ran the script and returns the work item to Provision, which provisions again and calls the Sampler with the script reference; `reject` returns it to Provision with the comment as feedback, so the Sampler writes a new script. The Sampler decides what happens next: another `awaitingRun` returns to the gate, a run that left no usable sample makes it give up, which blocks the work item, and a sample finishes Provision. The gate appears only when the Sampler answers `awaitingRun`, so it depends on the access level without the lifecycle knowing about access levels. Under a **Grant** the Sampler answers with a sample at once and the gate never appears.

Loop limits count trips around a loop whoever paces them, so passing the sample gate resets no counter. The gate's own loop is paced by a human and has no limit, like the spec gate's and ship gate's rejections.

## Considered Options

- **Keep Blocked, and make `retry` keep the counters when the reason is `SampleAwaitingRun`.** The smallest change, but it special-cases one reason in `retry` and still presents a wait for a human as a failure.
- **Wait for a real data source plugin before deciding**, as ADR 0005 did. Rejected: ADR 0001 and the Sampler contract already fix the human step, and lifecycle states are cheapest to change before the first release (#29).
