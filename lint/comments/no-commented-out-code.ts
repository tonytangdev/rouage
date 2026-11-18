import { defineRule } from "@oxlint/plugins";

import { commentLines, isDirective, isJsDoc } from "./comment-text.ts";

const LOOKS_LIKE_CODE = [
  /^(?:import|export|const|let|var|return|if|for|while|await|yield\*?|throw|function|class|type|interface)\b/u,
  /[;{}(]$/u,
  /^[\w$.]+\(.*\)[;,]?$/u,
  /^[\w$.[\]]+\s*[-+*/]?=\s*\S/u,
];

const isCodeLine = (line: string): boolean => LOOKS_LIKE_CODE.some((pattern) => pattern.test(line));

export const noCommentedOutCode = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Disallow commented-out code; version control keeps history." },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (isJsDoc(comment) || isDirective(comment)) {
            continue;
          }
          const lines = commentLines(comment);
          const codeLines = lines.filter(isCodeLine).length;
          if (codeLines > 0 && codeLines * 2 >= lines.length) {
            context.report({
              node: comment,
              message: "Commented-out code. Delete it; git keeps the history.",
            });
          }
        }
      },
    };
  },
});
