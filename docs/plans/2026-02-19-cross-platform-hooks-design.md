# Cross-Platform Hooks & Scripts — Node.js Rewrite

**Date:** 2026-02-19
**Status:** Approved
**Version target:** 1.3.0

## Problem

Windows users on native PowerShell cannot run Maestro hooks or scripts because everything is implemented in bash (`.sh`). The hooks also depend on `python3` for JSON parsing and regex matching. Both dependencies are unavailable in a default Windows PowerShell environment.

## Decision

Rewrite all hooks and scripts from bash + python3 to pure Node.js (zero npm dependencies). Node.js is guaranteed available because Gemini CLI requires it.

## Architecture

Layered module architecture with thin entry points composing shared library modules.

### Directory Structure

```
src/
  lib/
    stdin.js           — read/parse JSON from stdin
    state.js           — session state CRUD (resolve paths, read/write, active-session)
    hook-state.js      — tmp hook state: active-agent tracking, prune stale
    process.js         — timeout wrapper, child process helpers
    settings.js        — resolve_setting cascade (env -> .env -> extension .env -> default)
    response.js        — hook response builders (allow, deny, context)
    logger.js          — stderr logging
    validation.js      — session ID validation, agent name detection
    constants.js       — known agents list, default config values
hooks/
  before-agent.js      — entry point
  after-agent.js       — entry point
  session-start.js     — entry point
  session-end.js       — entry point
  hooks.json           — updated command references
scripts/
  parallel-dispatch.js — full rewrite with cross-platform process management
  ensure-workspace.js  — directory creation + validation
  read-state.js        — safe state file reader
  write-state.js       — atomic state file writer
  read-active-session.js — active session resolver
```

### Deleted Files

All `.sh` files in `hooks/` and `scripts/` are removed. No backwards-compatibility shims.

- `hooks/before-agent.sh`
- `hooks/after-agent.sh`
- `hooks/session-start.sh`
- `hooks/session-end.sh`
- `hooks/lib/common.sh`
- `scripts/parallel-dispatch.sh`
- `scripts/ensure-workspace.sh`
- `scripts/read-state.sh`
- `scripts/write-state.sh`
- `scripts/read-active-session.sh`

## Module Specifications

### src/lib/stdin.js

Replaces: `read_stdin()`, `json_get()`, `json_get_bool()`, `json_get_nested()` from common.sh

- `readJson()`: collect stdin into buffer, parse JSON. Returns `{}` if stdin is a TTY or empty.
- `get(obj, key)`: safe property access, returns `''` on missing.
- `getBool(obj, key)`: boolean coercion, returns `false` on missing.
- `getNested(obj, ...keys)`: deep property access through nested objects.

### src/lib/state.js

Replaces: `resolve_active_session_path()`, `has_active_maestro_session()`, `read-state.sh`, `write-state.sh`, `ensure-workspace.sh`

- `resolveActiveSessionPath(cwd)`: resolves path using `MAESTRO_STATE_DIR` (absolute or relative).
- `hasActiveSession(cwd)`: checks file existence.
- `readState(relativePath)`: validates path (no absolute, no traversal), reads file.
- `writeState(relativePath, content)`: validates path, atomic write (temp + rename).
- `ensureWorkspace(stateDir)`: creates the full directory tree (`state/`, `state/archive/`, `plans/`, `plans/archive/`, `parallel/`). Validates not absolute, no traversal, not symlink.

### src/lib/hook-state.js

Replaces: `get_active_agent()`, `set_active_agent()`, `clear_active_agent()`, `prune_stale_hook_state()`

Uses `os.tmpdir()` for cross-platform temp directory (`/tmp` on Unix, `%TEMP%` on Windows).

- `getBaseDir()`: returns `path.join(os.tmpdir(), 'maestro-hooks')`.
- `pruneStale()`: removes session dirs older than 2 hours using `fs.statSync().mtimeMs`.
- `setActiveAgent(sessionId, agentName)`: writes to temp file, renames atomically.
- `getActiveAgent(sessionId)`: reads active-agent file.
- `clearActiveAgent(sessionId)`: deletes active-agent file.

### src/lib/process.js

Replaces: `run_with_timeout()` from parallel-dispatch.sh

- `runWithTimeout(command, args, { stdin, stdout, stderr, cwd, env }, timeoutMs)`: spawns child process via `child_process.spawn`, applies timeout via `setTimeout`.
- Cross-platform termination: `SIGTERM` on Unix; on Windows, `child_process.execSync('taskkill /pid ... /t /f')` as fallback.
- Returns `{ exitCode, timedOut }`.

### src/lib/settings.js

Replaces: `resolve_setting()`, `read_env_var_from_file()` from parallel-dispatch.sh and read-active-session.sh

- `resolveSetting(varName, projectRoot)`: cascade — env var -> `projectRoot/.env` -> extension `.env` -> `undefined`.
- `parseEnvFile(filePath)`: reads key=value lines, strips quotes, ignores comments.

### src/lib/response.js

Replaces: `respond_allow()`, `respond_block()`, `respond_with_context()` from common.sh

- `allow()`: outputs `{"decision":"allow"}`.
- `deny(reason)`: outputs `{"decision":"deny","reason":"..."}`.
- `allowWithContext(context, hookEventName)`: outputs allow with `hookSpecificOutput`.
- `advisory()`: outputs `{}`.

### src/lib/logger.js

Replaces: `log_hook()` from common.sh

- `log(level, message)`: writes `[LEVEL] maestro: message` to stderr.

### src/lib/validation.js

Replaces: `validate_session_id()` from common.sh, Python agent detection regex from before-agent.sh

- `validateSessionId(id)`: returns boolean, checks `^[a-zA-Z0-9_-]+$`.
- `detectAgentFromPrompt(prompt)`: regex-based detection porting the Python delegation patterns. Checks `MAESTRO_CURRENT_AGENT` env first.

### src/lib/constants.js

- `KNOWN_AGENTS`: the 12 agent names.
- `DEFAULT_STATE_DIR`: `.gemini`.
- `DEFAULT_TIMEOUT_MINS`: `10`.
- `DEFAULT_STAGGER_DELAY`: `5`.
- `HOOK_STATE_TTL_MS`: `7200000` (2 hours).

## Hook Entry Points

### hooks/before-agent.js

1. `stdin.readJson()` to get input.
2. Extract `session_id`, `cwd`, `prompt`, `hook_event_name`.
3. `hookState.pruneStale()`.
4. Detect agent via `validation.detectAgentFromPrompt(prompt)`.
5. If agent found and session valid: `hookState.setActiveAgent()`.
6. Resolve `active-session.md`, extract `current_phase` and `status` via regex.
7. `response.allowWithContext()` or `response.allow()`.
8. Wrapped in safe-main error handler that falls back to `response.allow()`.

### hooks/after-agent.js

1. `stdin.readJson()` to get input.
2. Extract `session_id`, `stop_hook_active`.
3. `hookState.getActiveAgent(sessionId)`.
4. If non-orchestrator agent: validate `prompt_response` contains `## Task Report` and `## Downstream Context`.
5. First failure: `response.deny()` with retry message.
6. Retry failure (stop_hook_active): allow to prevent infinite loop.
7. `hookState.clearActiveAgent()`, `response.allow()`.

### hooks/session-start.js

1. `stdin.readJson()`, extract `session_id`, `cwd`.
2. Prune stale dirs in hook state base dir (2-hour TTL).
3. If no active Maestro session: `response.advisory()`.
4. If valid session: `mkdir` session dir in hook state.
5. `response.advisory()`.

### hooks/session-end.js

1. `stdin.readJson()`, extract `session_id`.
2. If valid session: `rm -rf` session dir from hook state.
3. `response.advisory()`.

## hooks.json Update

```json
{
  "hooks": {
    "BeforeAgent": [{
      "hooks": [{
        "type": "command",
        "command": "node ${extensionPath}/hooks/before-agent.js",
        "name": "maestro-before-agent",
        "description": "Inject session context into agent turns",
        "timeout": 10000
      }]
    }],
    "AfterAgent": [{
      "hooks": [{
        "type": "command",
        "command": "node ${extensionPath}/hooks/after-agent.js",
        "name": "maestro-after-agent",
        "description": "Validate handoff report format with retry on malformed output",
        "timeout": 10000
      }]
    }]
  }
}
```

## Parallel Dispatch Rewrite

### Preserved Behavior

- Prompt file validation (size limit 1MB, non-empty, agent exists in `agents/*.md`)
- Settings resolution cascade (env -> `.env` -> extension `.env` -> default)
- Model flag routing (default model, writer model override)
- Extra args passthrough with `--allowed-tools` deprecation warning
- Per-agent `.json`, `.exit`, `.log` result files
- `summary.json` with batch status
- Exit code = number of failed agents
- Concurrency control (max concurrent, stagger delay)
- Timeout per agent with graceful then forced termination
- Prompt payload: project root preamble + prompt file content via stdin

### Cross-Platform Changes

- `child_process.spawn('gemini', [...])` replaces bash subshells
- `path.join()` for all path construction
- `os.tmpdir()` for temp files
- `fs.readdirSync()` with filtering replaces `shopt -s nullglob` + glob
- Concurrency via Promise-based semaphore (track active, await slot)
- Timeout via `setTimeout` + `process.kill()` / `taskkill`
- Bash version detection (`SUPPORTS_WAIT_N`) is eliminated — not needed in Node.js async model

### Invocation Change

From: `bash ${extensionPath}/scripts/parallel-dispatch.sh <dispatch-dir>`
To: `node ${extensionPath}/scripts/parallel-dispatch.js <dispatch-dir>`

GEMINI.md references must be updated accordingly.

## Script Entry Points

### scripts/ensure-workspace.js

Same validation logic: reject absolute paths, path traversal, symlinks. Create directory tree.

### scripts/read-state.js

Same validation logic: reject absolute, reject traversal. Read and output file.

### scripts/write-state.js

Atomic write: write to temp file in parent dir, rename into place.

### scripts/read-active-session.js

Settings resolution for `MAESTRO_STATE_DIR`, then read `state/active-session.md`.

## Test Migration

Existing `tests/test-*.sh` scripts updated to invoke `node` instead of `bash`:
- `echo '...' | node hooks/before-agent.js` instead of `echo '...' | bash hooks/before-agent.sh`
- Same JSON assertions on stdout
- Same exit code checks

The test runner (`tests/run-all.sh`) remains bash — it just orchestrates test execution.

## Documentation Updates

- `CLAUDE.md`: update source-of-truth file list, hook contract, parallel dispatch contract
- `GEMINI.md`: update script invocation references
- Version bump to 1.3.0

## Error Handling

Every hook entry point wraps its main logic in a try/catch that:
- Logs the error to stderr
- Returns the safe default response (`{"decision":"allow"}` for blocking hooks, `{}` for advisory hooks)

This mirrors the current `safe_main` pattern.
