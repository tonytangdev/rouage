import { definePlugin } from "@oxlint/plugins";

import { noCommentedOutCode } from "./no-commented-out-code.ts";
import { noDanglingReference } from "./no-dangling-reference.ts";
import { noRestatingComment } from "./no-restating-comment.ts";

export default definePlugin({
  meta: { name: "comments" },
  rules: {
    "no-commented-out-code": noCommentedOutCode,
    "no-dangling-reference": noDanglingReference,
    "no-restating-comment": noRestatingComment,
  },
});
