import type { Comment } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { contentWords, explainsWhy, isDirective, isJsDoc } from "./comment-text.ts";

const MAX_RESTATING_WORDS = 6;

/** The code a comment annotates: the code before it on its line, else the next code line. */
const annotatedCode = (text: string, comment: Comment): string => {
  const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
  const before = text.slice(lineStart, comment.start).trim();
  if (before.length > 0) {
    return before;
  }
  const following = text.slice(comment.end).split("\n");
  const next = following.find((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
  });
  return next ?? "";
};

const restates = (comment: Comment, code: string): boolean => {
  const words = contentWords(comment.value);
  if (words.length === 0 || words.length > MAX_RESTATING_WORDS || explainsWhy(comment.value)) {
    return false;
  }
  const codeWords = new Set(contentWords(code));
  const echoed = words.filter((word) => codeWords.has(word)).length;
  return echoed * 2 >= words.length;
};

export const noRestatingComment = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Disallow comments that repeat what the next line of code says." },
  },
  create(context) {
    return {
      Program() {
        const { text } = context.sourceCode;
        for (const comment of context.sourceCode.getAllComments()) {
          if (isJsDoc(comment) || isDirective(comment)) {
            continue;
          }
          if (restates(comment, annotatedCode(text, comment))) {
            context.report({
              node: comment,
              message:
                "This comment restates the code. Delete it, or say why the code is this way.",
            });
          }
        }
      },
    };
  },
});
