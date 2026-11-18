# Agents read real data only with an explicit grant

Reproducing a bug against the exact data that triggers it is the surest way to know the fix works, but that data can be sensitive. By default an agent gets **Schema access** to a data source: it reads the schema, writes an extraction script that applies an allowlist sanitization, and the user reviews and runs it, so only sanitized rows reach the sandbox. **Data access**, where the agent queries rows itself, requires a standing, revocable grant per data source, declared in configuration and logged on every use. Under it the agent sees raw rows, so sanitization only applies to what leaves the sandbox.

## Considered Options

- **Agents never see raw data; extraction and sanitization always run as user-held scripts.** Safest, but rejected because some users trust their setup and want agents to explore data without a human in the loop.
- **Ask for permission on every sample.** Rejected: it trains users to click through approvals, which is weaker in practice than one deliberate grant.

## Consequences

- Credentials stay with the user; Rouage stores none. A data source refuses to start if its role can write.
- Sanitization rules are an allowlist, so a new sensitive column stays hidden until someone allows it.
- Samples are destroyed with the sandbox and never committed; regression tests use synthetic data.
