import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { createWorkItem, withDefaultStages } from "../../index.ts";
import { fakeSandboxTeardown } from "../../lifecycle/fake-sandbox-teardown.ts";
import { newWorkItem } from "../../lifecycle/test-fixtures.ts";
import { passingPorts } from "../../stages/passing-ports.ts";
import { flagValue, nodeFiles, pluginUnderTest } from "./claude-code-harness.ts";

// Rouage's own passing fakes fill the ports this slice of the plugin does not fill yet.
describe("the default lifecycle with the Claude Code plugin filling the Classifier", () => {
  it.effect("classifies the work item with claude and carries it on to the spec gate", () =>
    Effect.gen(function* () {
      const ports = yield* passingPorts;
      const plugin = yield* pluginUnderTest({
        runs: [{ _tag: "replays", transcript: "classified-as-bug" }],
      });
      const lifecycle = yield* withDefaultStages().pipe(
        Effect.provide(Layer.merge(ports.layer, plugin.layer)),
      );
      const workItem = yield* createWorkItem(lifecycle, newWorkItem).pipe(
        Effect.provide(fakeSandboxTeardown().layer),
      );
      yield* workItem.reaches("specGate");
      expect(workItem.context().facts).toMatchObject({ kind: "bug" });
      const [classify] = plugin.claude.spawned();
      expect(flagValue(classify?.args ?? [], "--agent")).toBe("rouage-classify");
      expect(plugin.claude.spawned()).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
