import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noCommentedOutCode } from "./no-commented-out-code.ts";
import { noDanglingReference } from "./no-dangling-reference.ts";
import { noRestatingComment } from "./no-restating-comment.ts";

RuleTester.describe = (name, run) => {
  describe(name, run);
};
RuleTester.it = (name, run) => {
  it(name, run);
};

const tester = new RuleTester({
  languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } },
});

describe("comments plugin", () => {
  tester.run("no-commented-out-code", noCommentedOutCode, {
    valid: [
      "// Capped at 3 because the upstream API rate-limits bursts.\nconst limit = 3;",
      "// oxlint-disable-next-line no-console\nconsole.log(1);",
      "/** Returns the total. */\nexport const total = 1;",
    ],
    invalid: [
      { code: "// const old = compute();\nconst x = 1;", errors: 1 },
      { code: "// return foo(bar);\nconst x = 1;", errors: 1 },
      { code: "/*\nif (ready) {\n  start();\n}\n*/\nconst x = 1;", errors: 1 },
    ],
  });

  tester.run("no-restating-comment", noRestatingComment, {
    valid: [
      "// Capped at 3 because the upstream API rate-limits bursts.\nconst limit = 3;",
      "// Upstream rejects payloads over 1 MB.\nconst maxBytes = 1_000_000;",
      "/** The actor. */\nexport const actor = 1;",
    ],
    invalid: [
      { code: "// create the actor\nconst actor = createActor();", errors: 1 },
      { code: "const retries = 3; // retry count", errors: 1 },
      { code: "// increment counter\ncounter += 1;", errors: 1 },
    ],
  });

  tester.run("no-dangling-reference", noDanglingReference, {
    valid: [
      "// Mirrors `parse` so both paths agree.\nconst parse = 1;",
      "// Uses `Promise.all` to fan out.\nconst x = 1;",
      "/** @param value the input */\nexport const double = (value: number) => value * 2;",
    ],
    invalid: [
      { code: "// See `computeTotal` for rounding.\nconst x = 1;", errors: 1 },
      {
        code: "/** @param amount the input */\nexport const double = (value: number) => value * 2;",
        errors: 1,
      },
    ],
  });
});
