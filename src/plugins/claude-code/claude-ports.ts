import { Context, Effect } from "effect";

import {
  Builder,
  Classifier,
  Demonstrator,
  Gatekeeper,
  Planner,
  Reproducer,
  Reviewer,
  SpecWriter,
} from "../../index.ts";
import { claudeBuilder } from "./claude-builder.ts";
import { claudeClassifier } from "./claude-classifier.ts";
import { claudeDemonstrator } from "./claude-demonstrator.ts";
import { claudeGatekeeper } from "./claude-gatekeeper.ts";
import { claudePlanner } from "./claude-planner.ts";
import { claudeReproducer } from "./claude-reproducer.ts";
import { claudeReviewer } from "./claude-reviewer.ts";
import { claudeSpecWriter } from "./claude-spec-writer.ts";
import type { PluginParts } from "./port-run.ts";
import type { RoleName } from "./role-name.ts";
import type { Role } from "./roles.ts";

/** Every port the plugin fills, each done in the roles `role` loads for it, all sharing `parts`. */
export const claudePorts = Effect.fnUntraced(function* <E, R>(
  parts: PluginParts,
  role: (name: RoleName) => Effect.Effect<Role, E, R>,
) {
  return Context.make(
    Classifier,
    claudeClassifier(parts, { classify: yield* role("classify") }),
  ).pipe(
    Context.add(SpecWriter, claudeSpecWriter(parts, { write: yield* role("write") })),
    Context.add(
      Reproducer,
      claudeReproducer(parts, {
        capture: yield* role("capture"),
        confirm: yield* role("confirm"),
      }),
    ),
    Context.add(
      Builder,
      claudeBuilder(parts, {
        implement: yield* role("implement"),
        test: yield* role("test"),
        fix: yield* role("fix"),
        checkReproduction: yield* role("checkReproduction"),
      }),
    ),
    Context.add(Planner, claudePlanner(parts, { plan: yield* role("plan") })),
    Context.add(
      Demonstrator,
      claudeDemonstrator(parts, { demonstrate: yield* role("demonstrate") }),
    ),
    Context.add(Reviewer, claudeReviewer(parts, { review: yield* role("review") })),
    Context.add(Gatekeeper, claudeGatekeeper(parts, { decide: yield* role("decide") })),
  );
});
