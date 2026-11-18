import { defineRule } from "@oxlint/plugins";

import { codeOnly } from "./comment-text.ts";

const BACKTICK_IDENTIFIER = /`([A-Za-z_$][\w$]*)(?:\.[\w$]+)*(?:\(\))?`/gu;
const PARAM_TAG = /@param\s+(?:\{[^}]*\}\s+)?\[?([A-Za-z_$][\w$]*)/gu;
const IDENTIFIER = /[A-Za-z_$][\w$]*/gu;

const referencedNames = (value: string): string[] => [
  ...[...value.matchAll(BACKTICK_IDENTIFIER)].map((match) => match[1] ?? ""),
  ...[...value.matchAll(PARAM_TAG)].map((match) => match[1] ?? ""),
];

export const noDanglingReference = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow comments that name identifiers no longer in the file." },
  },
  create(context) {
    return {
      Program() {
        const comments = context.sourceCode.getAllComments();
        const code = codeOnly(context.sourceCode.text, comments);
        const known = new Set(code.match(IDENTIFIER));
        for (const comment of comments) {
          const missing = referencedNames(comment.value).filter(
            (name) => !known.has(name) && !(name in globalThis),
          );
          for (const name of missing) {
            context.report({
              node: comment,
              message: `Stale comment: \`${name}\` no longer exists in this file. Update or delete it.`,
            });
          }
        }
      },
    };
  },
});
