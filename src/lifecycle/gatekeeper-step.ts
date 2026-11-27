import { DateTime, Effect, Option } from "effect";
import type { AsyncActorLogic } from "xstate";
import { createAsyncLogic } from "xstate";

import type { GatekeeperDecision, GatekeeperTask, PluginGate } from "./gatekeeper.ts";
import { Gatekeeper, gatekeeperBy, GatekeeperGaveUp } from "./gatekeeper.ts";
import type { GatekeeperKind } from "./gatekeepers.ts";
import { shownStageInput } from "./stage.ts";
import type { WorkItemContext } from "./work-item.ts";

/** A plugin gatekeeper's decision, who it is recorded as made by, and the ISO timestamp it was made at, read here because transitions read no clock. */
export interface GatekeeperJudgement {
  readonly decision: GatekeeperDecision;
  readonly by: string;
  readonly at: string;
}

/** What a gate asks its gatekeeper logic: who keeps the gate, and the task a plugin decides it from. */
export interface GateAsk {
  readonly gatekeeper: GatekeeperKind;
  readonly task: GatekeeperTask;
}

/**
 * The logic a gate runs while it waits: it finishes with a plugin
 * gatekeeper's judgement, or fails with `GatekeeperGaveUp`. A gate kept by a
 * human runs it too, because a registered source alone restores, and it
 * then never finishes, so the gate waits until a human decides.
 */
export type GatekeeperLogic = AsyncActorLogic<GatekeeperJudgement, GateAsk>;

const neverSettling = () => {
  // Left unsettled, because only a human leaving the gate ends the wait.
};

const asking = (
  decide: (task: GatekeeperTask, signal: AbortSignal) => Promise<GatekeeperJudgement>,
): GatekeeperLogic =>
  createAsyncLogic({
    run: ({ input, signal }) =>
      input.gatekeeper === "human"
        ? new Promise<GatekeeperJudgement>(neverSettling)
        : decide(input.task, signal),
  });

/**
 * The gatekeeper of a lifecycle no plugin gatekeeper is provided to: it gives
 * up at once, so a plugin-kept gate waits for a human instead.
 */
export const gatekeeperSlot: GatekeeperLogic = asking(() =>
  Promise.reject(new GatekeeperGaveUp({ message: "No Gatekeeper plugin is provided" })),
);

const judgedBy = (name: string) => (decision: GatekeeperDecision) =>
  DateTime.now.pipe(
    Effect.map((now) => ({ decision, by: gatekeeperBy(name), at: DateTime.formatIso(now) })),
  );

/**
 * The gatekeeper logic asking the `Gatekeeper` port in the Effect context,
 * interrupted when the gate is left. A work item restored while it judges
 * asks again with the same task.
 */
export const gatekeeperStep = Effect.fnUntraced(function* () {
  const gatekeeper = yield* Gatekeeper;
  const surrounding = yield* Effect.context();
  return asking((task, signal) =>
    Effect.runPromiseWith(surrounding)(
      gatekeeper.decide(task).pipe(Effect.flatMap(judgedBy(gatekeeper.name))),
      {
        signal,
      },
    ),
  );
});

/**
 * `gatekeeperStep` when a `Gatekeeper` port is in the Effect context, and
 * otherwise the slot that gives up, so plugin-kept gates wait for a human.
 */
export const providedGatekeeper = Effect.serviceOption(Gatekeeper).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.succeed(gatekeeperSlot),
      onSome: (port) => gatekeeperStep().pipe(Effect.provideService(Gatekeeper, port)),
    }),
  ),
);

interface GateArgument {
  readonly context: WorkItemContext;
}

/** What `gate` asks its gatekeeper: who keeps it, and the gate and the facts the stages work from as the task. */
export const gateAsk =
  (gate: PluginGate) =>
  (argument: GateArgument): GateAsk => ({
    gatekeeper: argument.context.gatekeepers[gate],
    task: { gate, ...shownStageInput(argument) },
  });
