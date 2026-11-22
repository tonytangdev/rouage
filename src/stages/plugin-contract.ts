import { describe, it } from "@effect/vitest";
import type { Layer } from "effect";
import { Data, Effect } from "effect";

/** A plugin did something its port promises it never does. */
export class PluginBrokeContract extends Data.TaggedError("PluginBrokeContract")<{
  readonly message: string;
}> {}

/** One promise of a port, as a check that fails when the plugin in its context breaks it. */
export interface PluginPromise<Ports> {
  readonly name: string;
  readonly check: Effect.Effect<void, unknown, Ports>;
}

/** Succeeds when `kept` holds, and fails with `PluginBrokeContract` carrying `message` otherwise. */
export const promiseKept = (kept: boolean, message: string) =>
  kept ? Effect.void : Effect.fail(new PluginBrokeContract({ message }));

/** The error `promise`'s check fails with against the plugin `layer` fills; dies if the plugin keeps the promise. */
export const howBroken = <Ports, E>(promise: PluginPromise<Ports>, layer: Layer.Layer<Ports, E>) =>
  Effect.flip(promise.check.pipe(Effect.provide(layer)));

/**
 * Declares one test per promise in `promises`, each run against a fresh
 * build of `layer`, the plugin under test (ADR 0018).
 */
export const describePluginContract = <Ports, E>(
  title: string,
  promises: Readonly<Record<string, PluginPromise<Ports>>>,
  layer: Layer.Layer<Ports, E>,
) => {
  describe(title, () => {
    for (const promise of Object.values(promises)) {
      it.effect(promise.name, () => promise.check.pipe(Effect.provide(layer)));
    }
  });
};
