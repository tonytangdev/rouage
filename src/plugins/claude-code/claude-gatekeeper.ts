import { Effect } from "effect";

import { Gatekeeper, GatekeeperDecisionSchema, GatekeeperGaveUp } from "../../index.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { PluginParts } from "./port-run.ts";
import { runRole } from "./port-run.ts";
import type { Role } from "./roles.ts";

const deciding = portAnswerOf(GatekeeperDecisionSchema);

const gateNames = { specGate: "spec gate", shipGate: "ship gate" } as const;

/**
 * The Gatekeeper port done in the read-only `decide` role, following the
 * user's own rules: the role's instructions and the skills it declares
 * (ADR 0021). Runs in the sandbox's workspace once there is one, so the ship
 * gate's judgement can read the change.
 */
export const claudeGatekeeper = (parts: PluginParts, roles: { readonly decide: Role }) =>
  Gatekeeper.of({
    decide: (task) =>
      runRole(parts, roles.decide, deciding, { ...task, gate: gateNames[task.gate] }).pipe(
        Effect.mapError((failure) => new GatekeeperGaveUp({ message: failure.message })),
      ),
  });
