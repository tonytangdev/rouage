import { Data } from "effect";

/** Claude Code has no login to run with. */
export class ClaudeNotLoggedIn extends Data.TaggedError("ClaudeNotLoggedIn")<{
  readonly message: string;
}> {}

/** The subscription's usage limit was reached; `resetsAt` is when it resets, if Claude said. */
export class UsageLimitReached extends Data.TaggedError("UsageLimitReached")<{
  readonly message: string;
  readonly resetsAt: Date | null;
}> {}

/** The run took longer than its role's timeout and was killed. */
export class RunTimedOut extends Data.TaggedError("RunTimedOut")<{
  readonly message: string;
}> {}

/** The run used every turn its role allows without answering. */
export class TurnLimitReached extends Data.TaggedError("TurnLimitReached")<{
  readonly message: string;
}> {}

/** Claude finished without an answer that matches the port's schema. */
export class AnswerUnreadable extends Data.TaggedError("AnswerUnreadable")<{
  readonly message: string;
}> {}

/** The claude CLI could not start, stopped with an error, or exited without a result. */
export class ClaudeCrashed extends Data.TaggedError("ClaudeCrashed")<{
  readonly message: string;
}> {}

/** Every way one Claude run can fail; each becomes the port's `*GaveUp` with its message. */
export type ClaudeRunFailure =
  | ClaudeNotLoggedIn
  | UsageLimitReached
  | RunTimedOut
  | TurnLimitReached
  | AnswerUnreadable
  | ClaudeCrashed;
