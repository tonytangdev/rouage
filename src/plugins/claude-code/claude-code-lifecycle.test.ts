import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Path } from "effect";

import { createWorkItem, withDefaultStages } from "../../index.ts";
import { fakeSandboxTeardown } from "../../lifecycle/fake-sandbox-teardown.ts";
import { newWorkItem, reviewer } from "../../lifecycle/test-fixtures.ts";
import { passingBuilder } from "../../stages/build/build-harness.ts";
import { passingPorts } from "../../stages/passing-ports.ts";
import { passingReproducer } from "../../stages/reproduce/reproduce-harness.ts";
import { flagValue, nodeFiles, pluginUnderTest } from "./claude-code-harness.ts";

// Rouage's own passing fakes fill the ports this slice of the plugin does not
// fill yet, and the Reproducer and Builder too, which need a real sandbox to run in (#60).
describe("the default lifecycle with the Claude Code plugin filling the ports it fills", () => {
  it.effect(
    "classifies, specs, plans and reviews a bug with claude, carrying it to the ship gate",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const ports = yield* passingPorts;
        const plugin = yield* pluginUnderTest({
          runs: [
            { _tag: "replays", transcript: "classified-as-bug" },
            { _tag: "replays", transcript: "spec-written" },
            { _tag: "replays", transcript: "planned-with-demo" },
            { _tag: "replays", transcript: "review-approved" },
          ],
        });
        const lifecycle = yield* withDefaultStages().pipe(
          Effect.provide(
            Layer.mergeAll(
              ports.layer,
              plugin.layer,
              (yield* passingReproducer).layer,
              (yield* passingBuilder).layer,
            ),
          ),
        );
        const workItem = yield* createWorkItem(lifecycle, newWorkItem).pipe(
          Effect.provide(fakeSandboxTeardown().layer),
        );
        yield* workItem.reaches("specGate");
        workItem.send({ type: "approve", ...reviewer });
        yield* workItem.reaches("shipGate");
        const artifactOf = (name: string) => path.join(plugin.artifactsDir, newWorkItem.id, name);
        expect(workItem.context().facts).toMatchObject({
          kind: "bug",
          specRef: artifactOf("spec.md"),
          planRef: artifactOf("plan.md"),
        });
        expect(plugin.claude.spawned().map(({ args }) => flagValue(args, "--agent"))).toStrictEqual(
          ["rouage-classify", "rouage-write", "rouage-plan", "rouage-review"],
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
