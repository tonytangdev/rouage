import { describeSandboxContract } from "../../index.ts";
import { provisionTask, sandboxLayer } from "./git-worktree-harness.ts";

describeSandboxContract("the git-worktree sandbox", sandboxLayer, provisionTask);
