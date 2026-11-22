import { Option, Result, Schema } from "effect";

import type { ClaudeRunFailure } from "./run-failures.ts";
import {
  AnswerUnreadable,
  ClaudeCrashed,
  ClaudeNotLoggedIn,
  TurnLimitReached,
  UsageLimitReached,
} from "./run-failures.ts";

const ResultEventSchema = Schema.Struct({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  is_error: Schema.Boolean,
  terminal_reason: Schema.optional(Schema.NullOr(Schema.String)),
  api_error_status: Schema.optional(Schema.NullOr(Schema.Finite)),
  result: Schema.optional(Schema.NullOr(Schema.String)),
  errors: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  structured_output: Schema.optional(Schema.Unknown),
});
type ResultEvent = typeof ResultEventSchema.Type;

const RateLimitEventSchema = Schema.Struct({
  type: Schema.Literal("rate_limit_event"),
  rate_limit_info: Schema.Struct({
    status: Schema.String,
    resetsAt: Schema.optional(Schema.NullOr(Schema.Finite)),
  }),
});

const ApiErrorEventSchema = Schema.Struct({
  type: Schema.Literal("assistant"),
  error: Schema.String,
});

const decodeEvent = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Union([ResultEventSchema, RateLimitEventSchema, ApiErrorEventSchema]),
  ),
);
type RunEvent = Option.Option.Value<ReturnType<typeof decodeEvent>>;

/** What a finished `claude` process left: its `stream-json` lines, exit code and stderr. */
export interface FinishedRun {
  readonly lines: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;
}

interface Reading {
  readonly result: ResultEvent | undefined;
  readonly apiErrors: readonly string[];
  readonly limitRejected: boolean;
  readonly resetsAt: Date | null;
}

const resetOf = (seconds: number | null | undefined) =>
  seconds === null || seconds === undefined ? null : new Date(seconds * 1000);

const read = (lines: readonly string[]): Reading => {
  const events = lines.flatMap((line): RunEvent[] => Option.toArray(decodeEvent(line)));
  const limits = events.flatMap((event) => (event.type === "rate_limit_event" ? [event] : []));
  const latestLimit = limits.at(-1)?.rate_limit_info;
  return {
    result: events.findLast((event) => event.type === "result"),
    apiErrors: events.flatMap((event) => (event.type === "assistant" ? [event.error] : [])),
    limitRejected: limits.some((event) => event.rate_limit_info.status === "rejected"),
    resetsAt: resetOf(latestLimit?.resetsAt),
  };
};

const said = (result: ResultEvent | undefined) =>
  [result?.result, ...(result?.errors ?? [])]
    .filter((text) => text !== null && text !== undefined)
    .join("; ");

const notLoggedIn = (reading: Reading) =>
  reading.apiErrors.includes("authentication_failed") ||
  /not logged in/iu.test(said(reading.result));

const usageLimited = (reading: Reading) =>
  reading.limitRejected || reading.apiErrors.includes("rate_limit");

const limitMessage = (resetsAt: Date | null) =>
  resetsAt === null
    ? "Claude's usage limit is reached and Claude did not say when it resets; retry later"
    : `Claude's usage limit is reached until ${resetsAt.toISOString()}; retry then, or turn on waitOnUsageLimit`;

const accountFailure = (reading: Reading): ClaudeRunFailure | undefined => {
  if (notLoggedIn(reading)) {
    return new ClaudeNotLoggedIn({
      message: `Claude Code is not logged in (${said(reading.result) || "no login found"}). Log in by running claude, or set CLAUDE_CODE_OAUTH_TOKEN from claude setup-token or ANTHROPIC_API_KEY, then retry`,
    });
  }
  if (usageLimited(reading)) {
    return new UsageLimitReached({
      message: limitMessage(reading.resetsAt),
      resetsAt: reading.resetsAt,
    });
  }
  return undefined;
};

const resultFailure = (result: ResultEvent): ClaudeRunFailure | undefined => {
  if (result.terminal_reason === "max_turns" || result.subtype === "error_max_turns") {
    return new TurnLimitReached({
      message: `Claude used every turn its role allows without answering (${said(result)})`,
    });
  }
  if (result.is_error || result.subtype !== "success") {
    const status = result.api_error_status ?? null;
    return new ClaudeCrashed({
      message: `Claude stopped with an error (${result.subtype}${status === null ? "" : `, API status ${status}`}): ${said(result) || "no message"}`,
    });
  }
  return undefined;
};

const crashedWithoutResult = (run: FinishedRun) =>
  new ClaudeCrashed({
    message: `claude exited with code ${run.exitCode} without a result: ${run.stderr.trim().slice(-2000) || "no output on stderr"}`,
  });

/**
 * The structured output of `run`, or how the run failed. A result's
 * `subtype` alone is not trusted, because a run that is not logged in ends
 * with `success`: `is_error`, `terminal_reason` and the API errors are read too.
 */
export const judgeRun = (run: FinishedRun): Result.Result<unknown, ClaudeRunFailure> => {
  const reading = read(run.lines);
  const failure =
    accountFailure(reading) ??
    (reading.result === undefined ? crashedWithoutResult(run) : resultFailure(reading.result));
  if (failure !== undefined) {
    return Result.fail(failure);
  }
  if (reading.result?.structured_output === undefined) {
    return Result.fail(
      new AnswerUnreadable({
        message: `Claude finished without a structured answer; it said: ${said(reading.result) || "nothing"}`,
      }),
    );
  }
  return Result.succeed(reading.result.structured_output);
};
