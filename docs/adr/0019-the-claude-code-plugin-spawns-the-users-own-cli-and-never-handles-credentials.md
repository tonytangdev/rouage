# The Claude Code plugin spawns the user's own CLI and never handles credentials

The Claude Code plugin fills each Agent port by spawning the user's installed, unmodified `claude` binary in print mode with a JSON schema made from the port's answer `Schema`, and decodes the run's structured output with that same `Schema`. It never reads, stores, forwards or asks for a credential: the spawned `claude` authenticates however the user already set it up, with a subscription login, a `claude setup-token` token or an API key in their own environment.

Most users run Claude Code on a Pro or Max subscription, and Anthropic's terms allow "an end user signing in to the unmodified Claude Code binary with their own Claude subscription" while forbidding third-party developers to "offer Claude.ai login", to "route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users", or to "collect, store, or intermediate Claude.ai credentials or session tokens" ([Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). A library the user runs that spawns their own binary and touches no credential stays on the permitted side. The Agent SDK's docs, by contrast, tell agents built on it to use API keys ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)).

## Considered Options

- **The Agent SDK's `query()`.** Rejected: its docs point SDK-built agents at API keys, it bundles its own copy of Claude Code rather than the user's, and its streaming session only pays off for long interactive threads, while every port call is one typed answer. T3 Code makes the same split: its chat threads use the SDK, its one-shot typed jobs spawn `claude -p --json-schema` ([pingdotgg/t3code](https://github.com/pingdotgg/t3code)).
- **A token option, or reading `~/.claude`.** Rejected: that is intermediating credentials, which the terms forbid, and the CLI already finds the user's login on its own.

## Consequences

- A run that fails because the user is not logged in is an ordinary port failure: the work item becomes blocked with Claude's message.
- The plugin passes the environment through unchanged except for the variables of a Claude session that launched Rouage, and moves Claude's home only through `CLAUDE_CONFIG_DIR`, never `HOME`, which would hide the macOS Keychain login.
- Bare mode never reads a subscription login, and Claude Code plans to make it the default for print mode, so the plugin must opt out of it explicitly once that changes.
- An MCP server's secrets reach a run only as `${ENV_VAR}` references that Claude Code expands itself.
