# Design: src/lib/ Reorganization

## Problem

All 13 modules in `src/lib/` are dumped flat with no directory structure. File names are vague (`constants.js`, `settings.js`, `process.js`, `response.js`), and several files mix unrelated responsibilities.

## Target Structure

```
src/lib/
  core/                             # Cross-cutting infrastructure
    logger.js                       # log(), fatal()
    atomic-write.js                 # atomicWriteSync()
    stdin-reader.js                 # readText(), readJson()
    env-file-parser.js              # parseEnvFile() — .env format parsing
    integer-parser.js               # isStrictInteger, parsePositive/NonNeg
    project-root-resolver.js        # resolveProjectRoot() via git
    agent-registry.js               # KNOWN_AGENTS + detectAgentFromPrompt()

  config/                           # Configuration resolution
    setting-resolver.js             # resolveSetting() cascaded lookup
    dispatch-config-resolver.js     # resolveDispatchConfig() assembly

  hooks/                            # Hook lifecycle system
    hook-facade.js                  # defineHook(), buildHookContext()
    hook-response.js                # allow/deny/allowWithContext/advisory
    hook-state.js                   # createHookState() session lifecycle

  state/                            # Session & workspace state
    session-state.js                # read/write state, ensureWorkspace
    session-id-validator.js         # validateSessionId()

  dispatch/                         # Parallel execution infrastructure
    process-runner.js               # runWithTimeout(), killProcess()
    concurrency-limiter.js          # ConcurrencyLimiter class
```

## Decomposition Map

| Old File | Disposition |
|---|---|
| `constants.js` | **Dissolved** — each constant inlines into its domain owner |
| `settings.js` | **Split** into `core/env-file-parser.js` + `config/setting-resolver.js` + `core/project-root-resolver.js` |
| `stdin.js` | **Split** into `core/stdin-reader.js` (readText/readJson); `get`/`getBool` inlined into `hooks/hook-facade.js` |
| `validation.js` | **Split** into `state/session-id-validator.js` + `core/agent-registry.js` |
| `dispatch-config.js` | **Split** into `core/integer-parser.js` + `config/dispatch-config-resolver.js` |
| `response.js` | **Renamed** to `hooks/hook-response.js` |
| `process.js` | **Renamed** to `dispatch/process-runner.js` |
| `maestro.js` | **Renamed** to `hooks/hook-facade.js` (absorbs `get`/`getBool`) |
| `file-utils.js` | **Renamed** to `core/atomic-write.js` |
| `concurrency.js` | **Renamed** to `dispatch/concurrency-limiter.js` |
| `state.js` | **Renamed** to `state/session-state.js` |
| `hook-state.js` | **Moved** to `hooks/hook-state.js` |
| `logger.js` | **Moved** to `core/logger.js` |

## Constants Dissolution

| Constant | New Home |
|---|---|
| `KNOWN_AGENTS` | `core/agent-registry.js` |
| `DEFAULT_STATE_DIR` | `state/session-state.js` |
| `DEFAULT_TIMEOUT_MINS` | `config/dispatch-config-resolver.js` |
| `DEFAULT_STAGGER_DELAY_SECS` | `config/dispatch-config-resolver.js` |
| `HOOK_STATE_TTL_MS` | `hooks/hook-state.js` |
| `MAX_PROMPT_SIZE_BYTES` | `dispatch/process-runner.js` |

## Internal Dependency Graph

```
core/ (no internal cross-deps within core/)
  ^
config/ depends on: core/env-file-parser, core/logger, core/integer-parser, core/project-root-resolver
  ^
hooks/ depends on: core/stdin-reader, core/logger, core/atomic-write, core/agent-registry, state/session-id-validator, state/session-state
  ^
state/ depends on: core/atomic-write
  ^
dispatch/ depends on: core/logger
```

## External Consumer Impact

| Consumer | Current Imports | New Imports |
|---|---|---|
| `hooks/*.js` | `../src/lib/maestro` | `../src/lib/hooks/hook-facade` |
| `scripts/parallel-dispatch.js` | `constants`, `settings`, `dispatch-config`, `process`, `concurrency`, `logger` | `config/setting-resolver`, `config/dispatch-config-resolver`, `dispatch/process-runner`, `dispatch/concurrency-limiter`, `core/logger` |
| `scripts/read-state.js` | `logger`, `state` | `core/logger`, `state/session-state` |
| `scripts/ensure-workspace.js` | `logger`, `state` | `core/logger`, `state/session-state` |
| `scripts/write-state.js` | `logger`, `state`, `stdin` | `core/logger`, `state/session-state`, `core/stdin-reader` |
| `scripts/read-active-session.js` | `settings`, `state` | `config/setting-resolver`, `state/session-state` |
| All unit tests | `../../src/lib/<old>` | `../../src/lib/<domain>/<new>` |

## Design Principles

- **Names reflect identity**: file names describe what the module IS, not what consumes it
- **Constants dissolve**: no grab-bag constants file; each constant lives with its domain
- **core/ is generic infrastructure**: zero internal cross-deps, usable by any domain
- **Domain dirs contain only domain-specific logic**: config/, hooks/, state/, dispatch/
- **get()/getBool() inlined**: sole consumer is buildHookContext(), no separate file needed
