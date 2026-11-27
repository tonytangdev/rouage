import type {
  ActorLogic,
  AnyActorLogic,
  AnyActorSystem,
  EmittedFrom,
  EventFrom,
  SnapshotFrom,
} from "xstate";

import type { GatekeeperChoices } from "./gatekeepers.ts";
import type { defaultLifecycle } from "./lifecycle.ts";
import type { WorkItemInput } from "./work-item.ts";

export type DefaultLifecycle = typeof defaultLifecycle;

/** A lifecycle's own name and the version of what a work item it saves holds. */
export interface LifecycleIdentity {
  readonly id: string;
  readonly version: string;
}

/** The logic a lifecycle runs each of its stages with, by stage name. */
export interface LifecycleSources {
  readonly sources: { readonly actors: Readonly<Record<string, AnyActorLogic>> };
}

/** The gatekeepers a lifecycle gives each work item created on it that does not choose its own (ADR 0021). */
export interface LifecycleGatekeepers {
  readonly gatekeepers?: GatekeeperChoices;
}

/**
 * The default lifecycle with any stage implementations provided, identified by
 * its own id and version. Providing stages gives each set of stages its own
 * machine type, so a work item accepts any logic with the default lifecycle's
 * snapshot, events and input. Rouage bumps the default lifecycle's version
 * whenever a saved work item could no longer restore as it did; a custom
 * lifecycle owns its id and version, and keeps the same rule (ADR 0002).
 */
export type Lifecycle = ActorLogic<
  SnapshotFrom<DefaultLifecycle>,
  EventFrom<DefaultLifecycle>,
  WorkItemInput,
  AnyActorSystem,
  EmittedFrom<DefaultLifecycle>
> &
  LifecycleIdentity &
  LifecycleSources &
  LifecycleGatekeepers;
