import { Config, Effect, Fiber, Schedule } from "effect";

import type { TeardownTask } from "./sandbox-teardown.ts";
import { SandboxTeardown } from "./sandbox-teardown.ts";

const attempts = Config.Int("ROUAGE_TEARDOWN_ATTEMPTS").pipe(Config.withDefault(5));

const teardownRetried = Effect.fnUntraced(function* (task: TeardownTask, tries: number) {
  const sandbox = yield* SandboxTeardown;
  return yield* sandbox.teardown(task).pipe(
    Effect.retry({ schedule: Schedule.exponential("1 second"), times: tries - 1 }),
    Effect.tapError((error) =>
      Effect.logError(`The sandbox of work item ${task.workItemId} outlives it: ${error.message}`),
    ),
  );
});

/**
 * Tears down the sandbox of the work item `workItemId` once `final` completes,
 * making up to `ROUAGE_TEARDOWN_ATTEMPTS` attempts (5 by default). Returns
 * `tornDown`, which completes once the sandbox is torn down, or fails with the
 * last error once every attempt has given up. The attempt count is read now, so
 * a misconfigured count fails here rather than at teardown.
 *
 * Closing the enclosing scope waits for the teardown once `isFinal` holds, and
 * cancels the wait otherwise.
 */
export const teardownWhenFinal = Effect.fnUntraced(function* (
  workItemId: string,
  final: Effect.Effect<void>,
  isFinal: () => boolean,
) {
  const tries = yield* attempts;
  // Detached rather than scoped, because callers close the scope right after the
  // final state, and a shipped work item is never restored to retry (ADR 0007).
  const fiber = yield* final.pipe(
    Effect.andThen(teardownRetried({ workItemId }, tries)),
    Effect.forkDetach,
  );
  yield* Effect.addFinalizer(() =>
    isFinal() ? Effect.asVoid(Fiber.await(fiber)) : Fiber.interrupt(fiber),
  );
  return { tornDown: Fiber.join(fiber) };
});
