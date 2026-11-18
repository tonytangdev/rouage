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

**Provision**:
The stage that prepares the sandbox a work item runs in, before any reproduction or build.
_Avoid_: Setup, bootstrap

**Gate**:
A transition that waits for a human decision before the work item moves on.
_Avoid_: Checkpoint, approval step

**Blocked**:
The state of a work item that cannot progress without human input, such as a bug that cannot be reproduced.

### Evidence

**Reproduction**:
Evidence, captured before any change, that a bug exists. Mandatory for every bug.

**Demo**:
Evidence, captured after a change, that it works. Optional, decided during Plan.

### Plugins

**Plugin**:
An external tool connected to Rouage through a contract for its kind.
_Avoid_: App, integration, extension

**Agent**:
A plugin kind that does work using AI, such as Claude Code.

**Script**:
A plugin kind that does work deterministically, without AI.

**Sandbox**:
A plugin kind that isolates where a work item's work runs, such as Docker.
_Avoid_: Environment, container

**Skill**:
A plugin kind holding instructions an agent loads.

**Data source**:
A plugin kind that gives access to a user's real data, such as a database.

### Data

**Sample**:
A subset of real data, taken from a data source to reproduce a bug against the exact data that triggers it.
_Avoid_: Dump, snapshot, fixture

**Schema access**:
The default access level to a data source: the agent sees its structure but no rows.

**Data access**:
The access level where the agent reads rows from a data source, allowed only by a grant.

**Grant**:
A user's standing, revocable permission for agents to have data access to one data source.
_Avoid_: Consent, approval

**Sanitization**:
The removal or masking of sensitive values in a sample, governed by an allowlist of fields that may pass.
