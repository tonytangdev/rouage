# The Claude Code plugin preloads a role's skills itself and sandboxes its Bash

A role must behave the same on every machine, whatever is in someone's personal Claude config, and a code-changing role must touch no file outside its workspace. Claude Code 2.1 gives neither out of the box. So the plugin reads each skill a role declares from its `skillsDir` or the repository's `.claude/skills` and appends it to the role's instructions. It also takes the Skill tool and every slash command away from the run (`--disallowedTools Skill`, `--disable-slash-commands`), unless the role allows undeclared skills. A role that may run any Bash command runs it in Claude Code's sandbox, which lets it write only in the working directory, unless the role bypasses permissions.

## Considered Options

- **The agent's own `skills` field.** Rejected: a live check showed Claude Code ignores it when the agent runs the main thread through `--agent`, so nothing is preloaded.
- **Allowing `Skill(<name>)` for each declared skill.** Rejected: Claude Code runs a skill with no rule at all without asking, even under `dontAsk`, and an `ask` or `deny` rule for `Skill` beats every allow rule. No rule set lets the declared skills through and denies the rest.
- **An extra skills folder through `--add-dir` or `--plugin-dir`.** Rejected: `--add-dir` also gives the role access to that folder's files, and `--plugin-dir` renames each skill `<plugin>:<skill>`. Both need the Skill tool, which can't be fenced, as above.
- **Narrow Bash rules for code-changing roles.** Rejected: such a role has to run whatever its tests and build need, so no list of commands fits. The sandbox confines what any command writes instead.

## Consequences

- A declared skill that is in neither folder fails the plugin's Layer build. A skill in someone's `~/.claude/skills` is never found, by design.
- With undeclared skills allowed, slash commands stay on too, because `--disable-slash-commands` also removes the Skill tool.
- Sandboxed Bash reaches the network only through the sandbox's proxy, so a tool that ignores the proxy env vars gets no network. A role that needs one runs under `bypassPermissions` in an isolated sandbox such as Docker.
- The sandbox must start (`failIfUnavailable`), so on a Linux machine without its dependencies a code-changing run fails rather than running Bash unconfined.
