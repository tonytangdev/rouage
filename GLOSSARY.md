# Rouage

Rouage is the core people build a software factory on. It models the software engineering lifecycle as state machines, and external tools plug into it.

## Language

**Software factory**:
A system that carries software work through the engineering lifecycle, built by a user on top of Rouage.
_Avoid_: Pipeline, platform

### Lifecycle

**Lifecycle**:
The ordered stages a work item passes through, from intake to delivery. Rouage ships a default one that users can extend or replace.
_Avoid_: SDLC, workflow

**Work item**:
One unit of software work travelling through the lifecycle, usually originating from an issue.
_Avoid_: Ticket, task, job

**Bug**:
A work item kind: existing behaviour is wrong and must be reproduced before it is fixed.

**Feature**:
A work item kind: new or changed behaviour.

**Stage**:
One step of the lifecycle. The default stages are Intake, Spec, Provision, Reproduce, Plan, Build, Demo, Review and Ship.
_Avoid_: Step, phase

**Stage machine**:
The state machine that carries out one stage. The lifecycle starts it when the work item enters the stage and stops it when the work item leaves. See [ADR 0002](docs/adr/0002-lifecycle-as-two-levels-of-persisted-machines.md).

**Outcome**:
How a stage machine finished, such as `reproduced`, `needsSample` or `changesRequested`. The lifecycle, not the stage, decides where each outcome leads. A stage that cannot finish has no outcome: it fails, and the work item becomes blocked.
_Avoid_: Result, status

**Spec**:
The written expected behaviour of a work item, approved by a human at the spec gate before any work on it starts.
_Avoid_: Requirements, PRD

**Plan**:
How a work item's change will be made, including whether a demo is worth it, written down for Build to follow. Written in the Plan stage, after the spec is approved and, for a bug, after it is reproduced.
_Avoid_: Design, approach, task list

**Review**:
The stage where a plugin judges the built change against its spec, plan and evidence, and either approves it or requests changes, which send it back to Build. A human's judgement comes after, at the ship gate.
_Avoid_: Code review, QA

**Ship**:
The stage that delivers a change a human approved at the ship gate, in the form the plugin chooses, such as a merged pull request or a deploy. Delivering a change again has no further effect.
_Avoid_: Deploy, release, merge

**Provision**:
The stage that prepares the sandbox a work item runs in, before any reproduction or build.
_Avoid_: Setup, bootstrap

**Gate**:
A transition that waits for a human decision before the work item moves on.
_Avoid_: Checkpoint, approval step

**Feedback**:
What the next stage to finish is asked to address: the comment a human gives when rejecting at a gate, retrying, or sending a work item back to Spec, or the changes Review requested. It is gone once any stage finishes.
_Avoid_: Notes, remarks

**Blocked**:
The state of a work item that cannot progress without human input: a bug that cannot be reproduced or whose reproduction does not fail, a stage that failed, or a loop that reached its limit. It records the stage the work item came from, so a human can retry that stage, send the work item back to Spec, or cancel it.

**Cancelled**:
The final state of a work item a human stopped. The stage it was in stops with it.

**Loop limit**:
The most times a work item may go around one loop of the lifecycle, such as Review back to Build, before it becomes blocked.

### Evidence

**Reproduction**:
Evidence, captured before any change, that a bug exists: a check that can be run again and fails while the bug exists, such as a failing test or a script. Mandatory for every bug, and confirmed failing before the work item moves on.
_Avoid_: Repro case, failing example

**Demo**:
Evidence, captured after a change, that it works, for whoever reviews the change to see. Its form, such as a screenshot or a recording, is the plugin's choice. Optional, decided during Plan; once planned, a demo that cannot be made blocks the work item.
_Avoid_: Showcase, proof

### Plugins

**Plugin**:
An external tool connected to Rouage through a contract for its kind.
_Avoid_: App, integration, extension

**Port**:
The interface a stage machine, or the lifecycle itself, runs its steps through, named for the job it asks for, such as Builder or Classifier. A plugin fills a port, and one plugin may fill several. A port that cannot carry out a step gives up, and the stage fails with the port's reason.
_Avoid_: Service

**Agent**:
A plugin kind that does work using AI, such as Claude Code.

**Script**:
A plugin kind that does work deterministically, without AI.

**Sandbox**:
A plugin kind that isolates where a work item's work runs, such as Docker. A work item keeps one sandbox from Provision until it is shipped or cancelled, when the sandbox is torn down; a blocked work item keeps its sandbox.
_Avoid_: Environment, container

**Skill**:
A plugin kind holding instructions an agent loads.

**Data source**:
A plugin kind that gives access to a user's real data, such as a database.

### Data

**Sample**:
A subset of real data, taken from a data source to reproduce a bug against the exact data that triggers it. Reproduce asks for one with a sample request, and Provision takes it into the sandbox. Under schema access, the work item waits at the sample gate until the user has run the extraction script.
_Avoid_: Dump, snapshot, fixture

**Sample request**:
Reproduce's description of the data a bug needs, which sends the work item back to Provision to take a sample.

**Extraction script**:
The script a plugin writes under schema access to take a sample, which the user reviews and runs, so only sanitized rows reach the sandbox.

**Schema access**:
The default access level to a data source: the agent sees its structure but no rows.

**Data access**:
The access level where the agent reads rows from a data source, allowed only by a grant.

**Grant**:
A user's standing, revocable permission for agents to have data access to one data source.
_Avoid_: Consent, approval

**Sanitization**:
The removal or masking of sensitive values in a sample, governed by an allowlist of fields that may pass.
