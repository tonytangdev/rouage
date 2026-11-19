# A sample run waits on a human through Blocked; one live sandbox per work item

When Reproduce finishes with `needsSample`, the work item returns to Provision, which takes a sample with the `Sampler` port. Under **Schema access** (ADR 0001) the Sampler can only write an extraction script that the user must review and run, so the stage cannot finish on its own. Stage machines take no human events, so the stage fails with reason `SampleAwaitingRun`, pointing at the script, and the work item becomes **Blocked**. The user runs the script and sends `retry`; Provision runs again and the Sampler, given the previous sample reference, finds the sample and answers `sampled`. Under a **Grant** the Sampler answers `sampled` at once and nothing blocks.

Provision always calls the `Provisioner` before sampling, in one step that a restart runs again from its start, and the sample request is never cleared, so a sandbox rebuilt after a retry, a return to Spec or a restart gets its sample back. Because a stage that fails mid-way never reports the sandbox it already created, the Provisioner keeps at most one live sandbox per work item: `provision` reuses or replaces it, and teardown is keyed by work item ID. The sandbox and sample references in context remain how other plugins find them (ADR 0004).

## Considered Options

- **A `sampleGate` in the lifecycle.** A cleaner model of a human decision, but it is conditional on the access level and needs its own Provision outcome. Rejected until a real data source plugin shows what the human step looks like.
- **A sample run that skips provisioning and only samples.** Cheaper, but loses the sample when the sandbox was rebuilt.
- **Storing the sandbox reference as soon as the Provisioner returns.** Needs a mid-stage output channel that stage machines do not have.

## Consequences

- A retry resets the loop counters, so each extraction run the user performs also resets the Reproduce loop count.
- A Provisioner plugin must track its sandbox by work item ID, unlike other plugins, which rely only on references.
