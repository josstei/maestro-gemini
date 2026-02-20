# src/lib/ Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the flat `src/lib/` directory into domain-scoped subdirectories with single-responsibility modules and improved naming conventions.

**Architecture:** Mechanical refactoring — no behavioral changes. Split mixed-concern files into single-responsibility modules, dissolve the grab-bag constants file, rename vague files, and organize into `core/`, `config/`, `state/`, `hooks/`, `dispatch/` subdirectories. All existing tests must pass after migration.

**Tech Stack:** Node.js (CommonJS modules), `node --test` runner

**Design Doc:** `docs/plans/2026-02-20-lib-reorganization-design.md`

---

### Task 1: Create directory structure

**Files:**
- Create: `src/lib/core/`, `src/lib/config/`, `src/lib/state/`, `src/lib/hooks/`, `src/lib/dispatch/`

**Step 1: Create all subdirectories**

```bash
mkdir -p src/lib/core src/lib/config src/lib/state src/lib/hooks src/lib/dispatch
```

**Step 2: Commit**

```bash
git add src/lib/core/.gitkeep src/lib/config/.gitkeep src/lib/state/.gitkeep src/lib/hooks/.gitkeep src/lib/dispatch/.gitkeep 2>/dev/null
git commit --allow-empty -m "chore: create src/lib subdirectory structure"
```

---

### Task 2: Create core/ modules (7 files)

All `core/` modules are zero-dependency or depend only on `core/logger.js`. Create them all in this task.

**Files:**
- Create: `src/lib/core/logger.js`
- Create: `src/lib/core/atomic-write.js`
- Create: `src/lib/core/stdin-reader.js`
- Create: `src/lib/core/env-file-parser.js`
- Create: `src/lib/core/integer-parser.js`
- Create: `src/lib/core/project-root-resolver.js`
- Create: `src/lib/core/agent-registry.js`

**Step 1: Create `src/lib/core/logger.js`**

Copy content from `src/lib/logger.js` unchanged. Exports: `log`, `fatal`.

**Step 2: Create `src/lib/core/atomic-write.js`**

Copy content from `src/lib/file-utils.js` unchanged. Exports: `atomicWriteSync`.

**Step 3: Create `src/lib/core/stdin-reader.js`**

Extract `readText()` and `readJson()` from `src/lib/stdin.js`. Do NOT include `get()` or `getBool()` — `get()` is dead code (unused in production), and `getBool()` moves to `hooks/hook-facade.js` as a private function.

```js
'use strict';

function readText() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      resolve(chunks.join(''));
    });
    process.stdin.resume();
  });
}

function readJson() {
  return readText().then((raw) => {
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  });
}

module.exports = { readText, readJson };
```

**Step 4: Create `src/lib/core/env-file-parser.js`**

Extract `trimQuotes()`, `stripInlineComment()`, `parseEnvFile()` from `src/lib/settings.js`. Only import is `fs` (Node built-in).

```js
'use strict';

const fs = require('fs');

function trimQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function stripInlineComment(value) {
  let activeQuote = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (activeQuote) {
      if (ch === activeQuote && value[i - 1] !== '\\') {
        activeQuote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      activeQuote = ch;
      continue;
    }
    if (ch === '#' && i > 0 && /\s/.test(value[i - 1])) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function parseEnvFile(filePath) {
  const result = {};
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return result;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const stripped = trimmed.replace(/^export\s+/, '');
    const eqIndex = stripped.indexOf('=');
    if (eqIndex === -1) continue;
    const key = stripped.slice(0, eqIndex);
    if (!key) continue;
    const rawValue = stripInlineComment(stripped.slice(eqIndex + 1));
    result[key] = trimQuotes(rawValue);
  }
  return result;
}

module.exports = { parseEnvFile };
```

**Step 5: Create `src/lib/core/integer-parser.js`**

Extract `isStrictInteger()`, `parsePositiveInteger()`, `parseNonNegativeInteger()` from `src/lib/dispatch-config.js`. Depends on `core/logger` for `fatal()`.

```js
'use strict';

const { fatal } = require('./logger');

function isStrictInteger(value) {
  return typeof value === 'string' && /^[0-9]+$/.test(value);
}

function parsePositiveInteger(varName, rawValue) {
  if (!isStrictInteger(rawValue)) {
    fatal(`${varName} must be a positive integer (got: ${rawValue})`);
  }
  const parsed = Number(rawValue);
  if (parsed <= 0) {
    fatal(`${varName} must be a positive integer (got: ${rawValue})`);
  }
  return parsed;
}

function parseNonNegativeInteger(varName, rawValue) {
  if (!isStrictInteger(rawValue)) {
    fatal(`${varName} must be a non-negative integer (got: ${rawValue})`);
  }
  return Number(rawValue);
}

module.exports = { isStrictInteger, parsePositiveInteger, parseNonNegativeInteger };
```

**Step 6: Create `src/lib/core/project-root-resolver.js`**

Extract `resolveProjectRoot()` from `src/lib/settings.js`. Only import is `child_process` (Node built-in).

```js
'use strict';

const { execSync } = require('child_process');

function resolveProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

module.exports = { resolveProjectRoot };
```

**Step 7: Create `src/lib/core/agent-registry.js`**

Extract `KNOWN_AGENTS`, `AGENT_PATTERNS`, `detectAgentFromPrompt()` from `src/lib/validation.js`. Inline the `KNOWN_AGENTS` constant (previously from `constants.js`). No lib dependencies.

```js
'use strict';

const KNOWN_AGENTS = Object.freeze([
  'architect',
  'api_designer',
  'code_reviewer',
  'coder',
  'data_engineer',
  'debugger',
  'devops_engineer',
  'performance_engineer',
  'refactor',
  'security_engineer',
  'technical_writer',
  'tester',
]);

const AGENT_PATTERNS = KNOWN_AGENTS.map((agent) => {
  const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    agent,
    patterns: [
      new RegExp(`(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?${escaped}\\b`),
      new RegExp(`@${escaped}\\b`),
    ],
  };
});

function detectAgentFromPrompt(prompt) {
  const envAgent = process.env.MAESTRO_CURRENT_AGENT;
  if (envAgent && KNOWN_AGENTS.includes(envAgent)) return envAgent;

  if (!prompt) return '';

  const lower = prompt.toLowerCase();
  for (const { agent, patterns } of AGENT_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      return agent;
    }
  }

  return '';
}

module.exports = { KNOWN_AGENTS, detectAgentFromPrompt };
```

**Step 8: Commit**

```bash
git add src/lib/core/
git commit -m "refactor: create core/ modules — logger, atomic-write, stdin-reader, env-file-parser, integer-parser, project-root-resolver, agent-registry"
```

---

### Task 3: Create state/ modules (2 files)

Depends on: `core/atomic-write.js`

**Files:**
- Create: `src/lib/state/session-state.js`
- Create: `src/lib/state/session-id-validator.js`

**Step 1: Create `src/lib/state/session-id-validator.js`**

Extract `validateSessionId()` and `SESSION_ID_PATTERN` from `src/lib/validation.js`. No lib dependencies.

```js
'use strict';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateSessionId(id) {
  if (id == null || typeof id !== 'string') return false;
  return SESSION_ID_PATTERN.test(id);
}

module.exports = { validateSessionId };
```

**Step 2: Create `src/lib/state/session-state.js`**

Copy content from `src/lib/state.js`. Changes:
- Inline `DEFAULT_STATE_DIR = '.gemini'` (previously from `constants.js`)
- Update import: `require('./constants')` → removed (constant inlined)
- Update import: `require('./file-utils')` → `require('../core/atomic-write')`
- Export `DEFAULT_STATE_DIR` (used by tests that previously tested constants)

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../core/atomic-write');

const DEFAULT_STATE_DIR = '.gemini';

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error(`Path must be relative (got: ${filePath})`);
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error(`Path traversal not allowed (got: ${filePath})`);
  }
}

function resolveActiveSessionPath(cwd) {
  const stateDir = process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;

  if (path.isAbsolute(stateDir)) {
    return path.join(stateDir, 'state', 'active-session.md');
  }

  validateRelativePath(stateDir);
  const base = cwd || process.cwd();
  return path.join(base, stateDir, 'state', 'active-session.md');
}

function hasActiveSession(cwd) {
  try {
    const sessionPath = resolveActiveSessionPath(cwd);
    return fs.existsSync(sessionPath);
  } catch {
    return false;
  }
}

function readState(relativePath, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function writeState(relativePath, content, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  atomicWriteSync(fullPath, content);
}

function ensureWorkspace(stateDir, basePath) {
  validateRelativePath(stateDir);
  const fullBase = path.join(basePath, stateDir);
  try {
    const stats = fs.lstatSync(fullBase);
    if (stats.isSymbolicLink()) {
      throw new Error(`STATE_DIR must not be a symlink (got: ${stateDir})`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const dirs = [
    path.join(fullBase, 'state'),
    path.join(fullBase, 'state', 'archive'),
    path.join(fullBase, 'plans'),
    path.join(fullBase, 'plans', 'archive'),
    path.join(fullBase, 'parallel'),
  ];
  for (const dir of dirs) {
    const relativeDir = path.relative(basePath, dir) || dir;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      throw new Error(`Failed to create directory: ${relativeDir}`);
    }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(`Directory not writable: ${relativeDir}`);
    }
  }
}

module.exports = {
  DEFAULT_STATE_DIR,
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
};
```

**Step 3: Commit**

```bash
git add src/lib/state/
git commit -m "refactor: create state/ modules — session-state, session-id-validator"
```

---

### Task 4: Create config/ modules (2 files)

Depends on: `core/env-file-parser.js`, `core/integer-parser.js`

**Files:**
- Create: `src/lib/config/setting-resolver.js`
- Create: `src/lib/config/dispatch-config-resolver.js`

**Step 1: Create `src/lib/config/setting-resolver.js`**

Extract `resolveSetting()` from `src/lib/settings.js`. Changes:
- Import `parseEnvFile` from `../core/env-file-parser` (previously defined in same file)
- Remove `resolveProjectRoot` (moved to `core/project-root-resolver.js`)
- Remove `parseEnvFile`, `trimQuotes`, `stripInlineComment` (moved to `core/env-file-parser.js`)

```js
'use strict';

const path = require('path');
const os = require('os');
const { parseEnvFile } = require('../core/env-file-parser');

function resolveSetting(varName, projectRoot) {
  const envValue = process.env[varName];
  if (envValue !== undefined && envValue !== '') return envValue;

  const projectEnv = parseEnvFile(path.join(projectRoot, '.env'));
  if (projectEnv[varName] !== undefined && projectEnv[varName] !== '') return projectEnv[varName];

  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH ||
    path.join(os.homedir(), '.gemini', 'extensions', 'maestro');
  const extEnv = parseEnvFile(path.join(extensionRoot, '.env'));
  if (extEnv[varName] !== undefined && extEnv[varName] !== '') return extEnv[varName];

  return undefined;
}

module.exports = { resolveSetting };
```

**Step 2: Create `src/lib/config/dispatch-config-resolver.js`**

Extract `resolveDispatchConfig()` from `src/lib/dispatch-config.js`. Changes:
- Inline `DEFAULT_TIMEOUT_MINS = 10` and `DEFAULT_STAGGER_DELAY_SECS = 5` (previously from `constants.js`)
- Import `resolveSetting` from `./setting-resolver` (previously from `./settings`)
- Import `parsePositiveInteger`, `parseNonNegativeInteger` from `../core/integer-parser` (previously defined in same file)
- Remove `fatal` import (no longer needed directly)
- Remove integer parsing functions (moved to `core/integer-parser.js`)

```js
'use strict';

const { resolveSetting } = require('./setting-resolver');
const { parsePositiveInteger, parseNonNegativeInteger } = require('../core/integer-parser');

const DEFAULT_TIMEOUT_MINS = 10;
const DEFAULT_STAGGER_DELAY_SECS = 5;

function resolveDispatchConfig(projectRoot) {
  const defaultModel = resolveSetting('MAESTRO_DEFAULT_MODEL', projectRoot) || '';
  const writerModel = resolveSetting('MAESTRO_WRITER_MODEL', projectRoot) || '';
  const agentTimeoutRaw = resolveSetting('MAESTRO_AGENT_TIMEOUT', projectRoot) || String(DEFAULT_TIMEOUT_MINS);
  const maxConcurrentRaw = resolveSetting('MAESTRO_MAX_CONCURRENT', projectRoot) || '0';
  const staggerDelayRaw = resolveSetting('MAESTRO_STAGGER_DELAY', projectRoot) || String(DEFAULT_STAGGER_DELAY_SECS);
  const extraArgsRaw = resolveSetting('MAESTRO_GEMINI_EXTRA_ARGS', projectRoot) || '';

  const timeoutMins = parsePositiveInteger('MAESTRO_AGENT_TIMEOUT', agentTimeoutRaw);
  const timeoutMs = timeoutMins * 60 * 1000;
  const maxConcurrent = parseNonNegativeInteger('MAESTRO_MAX_CONCURRENT', maxConcurrentRaw);
  const staggerDelay = parseNonNegativeInteger('MAESTRO_STAGGER_DELAY', staggerDelayRaw);
  const extraArgs = extraArgsRaw ? extraArgsRaw.split(/\s+/).filter(Boolean) : [];

  return {
    defaultModel,
    writerModel,
    timeoutMins,
    timeoutMs,
    maxConcurrent,
    staggerDelay,
    extraArgs,
    extraArgsRaw,
  };
}

module.exports = { resolveDispatchConfig };
```

**Step 3: Commit**

```bash
git add src/lib/config/
git commit -m "refactor: create config/ modules — setting-resolver, dispatch-config-resolver"
```

---

### Task 5: Create hooks/ modules (3 files)

Depends on: `core/logger.js`, `core/stdin-reader.js`, `core/atomic-write.js`, `core/agent-registry.js`, `state/session-id-validator.js`, `state/session-state.js`

**Files:**
- Create: `src/lib/hooks/hook-response.js`
- Create: `src/lib/hooks/hook-state.js`
- Create: `src/lib/hooks/hook-facade.js`

**Step 1: Create `src/lib/hooks/hook-response.js`**

Copy content from `src/lib/response.js` unchanged. Exports: `allow`, `deny`, `allowWithContext`, `advisory`.

**Step 2: Create `src/lib/hooks/hook-state.js`**

Copy content from `src/lib/hook-state.js`. Changes:
- Inline `HOOK_STATE_TTL_MS = 2 * 60 * 60 * 1000` (previously from `constants.js`)
- Update import: `require('./logger')` → `require('../core/logger')`
- Update import: `require('./validation')` → extract only `validateSessionId` from `require('../state/session-id-validator')`
- Update import: `require('./constants')` → removed (constant inlined)
- Update import: `require('./file-utils')` → `require('../core/atomic-write')`

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../core/logger');
const { validateSessionId } = require('../state/session-id-validator');
const { atomicWriteSync } = require('../core/atomic-write');

const HOOK_STATE_TTL_MS = 2 * 60 * 60 * 1000;

const DEFAULT_BASE_DIR = process.platform === 'win32'
  ? path.join(os.tmpdir(), 'maestro-hooks')
  : '/tmp/maestro-hooks';

function createHookState(baseDir = DEFAULT_BASE_DIR) {
  function getBaseDir() {
    return baseDir;
  }

  function pruneStale() {
    if (!fs.existsSync(baseDir)) return;

    const now = Date.now();
    let entries;
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(baseDir, entry.name);
      try {
        const stat = fs.lstatSync(dirPath);
        if (now - stat.mtimeMs > HOOK_STATE_TTL_MS) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  function setActiveAgent(sessionId, agentName) {
    if (!validateSessionId(sessionId)) {
      log('ERROR', 'Invalid session_id: contains unsafe characters');
      return false;
    }
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    atomicWriteSync(agentFile, agentName);
    return true;
  }

  function getActiveAgent(sessionId) {
    if (!validateSessionId(sessionId)) return '';
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    try {
      return fs.readFileSync(agentFile, 'utf8').trim();
    } catch {
      return '';
    }
  }

  function clearActiveAgent(sessionId) {
    if (!validateSessionId(sessionId)) return;
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    try {
      fs.unlinkSync(agentFile);
    } catch {}
  }

  function ensureSessionDir(sessionId) {
    if (!validateSessionId(sessionId)) return false;
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true });
    return true;
  }

  function removeSessionDir(sessionId) {
    if (!validateSessionId(sessionId)) return false;
    try {
      fs.rmSync(path.join(baseDir, sessionId), { recursive: true, force: true });
    } catch {}
    return true;
  }

  return {
    getBaseDir,
    pruneStale,
    setActiveAgent,
    getActiveAgent,
    clearActiveAgent,
    ensureSessionDir,
    removeSessionDir,
  };
}

const defaultInstance = createHookState();

module.exports = {
  createHookState,
  DEFAULT_BASE_DIR,
  ...defaultInstance,
};
```

**Step 3: Create `src/lib/hooks/hook-facade.js`**

Rewrite of `src/lib/maestro.js`. Changes:
- Absorb `getBool()` from `src/lib/stdin.js` as a private function (not exported)
- Update imports to new module paths
- Assemble `validation` namespace from two separate modules

```js
'use strict';

const { readJson } = require('../core/stdin-reader');
const { log } = require('../core/logger');
const response = require('./hook-response');
const { validateSessionId } = require('../state/session-id-validator');
const { detectAgentFromPrompt } = require('../core/agent-registry');
const hookState = require('./hook-state');
const state = require('../state/session-state');

function getBool(obj, key) {
  if (obj == null || typeof obj !== 'object') return false;
  const val = obj[key];
  if (val === true || val === 'true') return true;
  return false;
}

function buildHookContext(input) {
  return {
    sessionId: input.session_id || '',
    cwd: input.cwd || '',
    prompt: input.prompt || '',
    hookEventName: input.hook_event_name || '',
    promptResponse: input.prompt_response || '',
    stopHookActive: getBool(input, 'stop_hook_active'),
    input,
  };
}

function defineHook({ handler, fallbackResponse }) {
  readJson()
    .then((input) => {
      const ctx = buildHookContext(input);
      return handler(ctx);
    })
    .then((result) => {
      process.stdout.write(result + '\n');
    })
    .catch((err) => {
      log('ERROR', `Hook failed — returning safe default: ${err.message}`);
      process.stdout.write(fallbackResponse() + '\n');
    });
}

const validation = { validateSessionId, detectAgentFromPrompt };

module.exports = {
  defineHook,
  buildHookContext,
  response,
  validation,
  hookState,
  state,
  log,
};
```

**Step 4: Commit**

```bash
git add src/lib/hooks/
git commit -m "refactor: create hooks/ modules — hook-facade, hook-response, hook-state"
```

---

### Task 6: Create dispatch/ modules (2 files)

Depends on: `core/logger.js`

**Files:**
- Create: `src/lib/dispatch/process-runner.js`
- Create: `src/lib/dispatch/concurrency-limiter.js`

**Step 1: Create `src/lib/dispatch/process-runner.js`**

Copy content from `src/lib/process.js`. Changes:
- Update import: `require('./logger')` → `require('../core/logger')`

```js
'use strict';

const { spawn, execSync } = require('child_process');
const { log } = require('../core/logger');

function killProcess(pid, signal = 'SIGTERM') {
  if (pid == null) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
    } else {
      process.kill(pid, signal);
    }
  } catch {}
}

function runWithTimeout(command, args, options = {}, timeoutMs) {
  if (typeof timeoutMs !== 'number' || !isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`timeoutMs must be a positive finite number (got: ${timeoutMs})`);
  }

  return new Promise((resolve) => {
    const { stdin: stdinStream, stdout: stdoutDest, stderr: stderrDest, cwd, env } = options;

    const spawnOptions = {
      stdio: [
        stdinStream ? 'pipe' : 'ignore',
        typeof stdoutDest === 'number' ? stdoutDest : 'ignore',
        typeof stderrDest === 'number' ? stderrDest : 'ignore',
      ],
      cwd,
      env: env || process.env,
    };

    const child = spawn(command, args, spawnOptions);
    let timedOut = false;
    let settled = false;

    let forceKillTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      log('WARN', `Process ${child.pid ?? 'unknown'} timed out after ${timeoutMs}ms`);
      killProcess(child.pid);
      forceKillTimer = setTimeout(() => {
        try {
          process.kill(child.pid, 0);
          killProcess(child.pid, 'SIGKILL');
        } catch {}
      }, 5000);
    }, timeoutMs);

    if (stdinStream && child.stdin) {
      stdinStream.pipe(child.stdin);
    }

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      resolve({
        exitCode: timedOut ? 124 : (code ?? 255),
        timedOut,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      log('ERROR', `Process spawn error: ${err.message}`);
      resolve({ exitCode: 255, timedOut: false });
    });
  });
}

module.exports = { runWithTimeout };
```

**Step 2: Create `src/lib/dispatch/concurrency-limiter.js`**

Copy content from `src/lib/concurrency.js` unchanged. Exports: `ConcurrencyLimiter`.

**Step 3: Commit**

```bash
git add src/lib/dispatch/
git commit -m "refactor: create dispatch/ modules — process-runner, concurrency-limiter"
```

---

### Task 7: Update hook consumers (4 files)

All four hooks import from the maestro facade. Update the single import path.

**Files:**
- Modify: `hooks/before-agent.js:5`
- Modify: `hooks/after-agent.js:4`
- Modify: `hooks/session-start.js:4`
- Modify: `hooks/session-end.js:4`

**Step 1: Update all four hooks**

In each file, change:
```js
require('../src/lib/maestro')
```
to:
```js
require('../src/lib/hooks/hook-facade')
```

**Step 2: Commit**

```bash
git add hooks/
git commit -m "refactor: update hooks to import from hooks/hook-facade"
```

---

### Task 8: Update script consumers (5 files)

**Files:**
- Modify: `scripts/parallel-dispatch.js:7-12`
- Modify: `scripts/read-state.js:4-5`
- Modify: `scripts/ensure-workspace.js:4-5`
- Modify: `scripts/write-state.js:4-6`
- Modify: `scripts/read-active-session.js:5-6`

**Step 1: Update `scripts/parallel-dispatch.js`**

Change imports:
```js
// OLD
const { resolveDispatchConfig } = require('../src/lib/dispatch-config');
const { ConcurrencyLimiter } = require('../src/lib/concurrency');
const { resolveSetting } = require('../src/lib/settings');
const { runWithTimeout } = require('../src/lib/process');
const { log, fatal } = require('../src/lib/logger');
const { MAX_PROMPT_SIZE_BYTES } = require('../src/lib/constants');

// NEW
const { resolveDispatchConfig } = require('../src/lib/config/dispatch-config-resolver');
const { ConcurrencyLimiter } = require('../src/lib/dispatch/concurrency-limiter');
const { resolveSetting } = require('../src/lib/config/setting-resolver');
const { runWithTimeout } = require('../src/lib/dispatch/process-runner');
const { log, fatal } = require('../src/lib/core/logger');

const MAX_PROMPT_SIZE_BYTES = 1_000_000;
```

Note: `MAX_PROMPT_SIZE_BYTES` is inlined as a local constant (only consumer was this file).

**Step 2: Update `scripts/read-state.js`**

Change imports:
```js
// OLD
const { readState } = require('../src/lib/state');
const { fatal } = require('../src/lib/logger');

// NEW
const { readState } = require('../src/lib/state/session-state');
const { fatal } = require('../src/lib/core/logger');
```

**Step 3: Update `scripts/ensure-workspace.js`**

Change imports:
```js
// OLD
const { ensureWorkspace } = require('../src/lib/state');
const { fatal } = require('../src/lib/logger');

// NEW
const { ensureWorkspace } = require('../src/lib/state/session-state');
const { fatal } = require('../src/lib/core/logger');
```

**Step 4: Update `scripts/write-state.js`**

Change imports:
```js
// OLD
const { writeState } = require('../src/lib/state');
const { readText } = require('../src/lib/stdin');
const { fatal } = require('../src/lib/logger');

// NEW
const { writeState } = require('../src/lib/state/session-state');
const { readText } = require('../src/lib/core/stdin-reader');
const { fatal } = require('../src/lib/core/logger');
```

**Step 5: Update `scripts/read-active-session.js`**

Change imports:
```js
// OLD
const { resolveSetting, resolveProjectRoot } = require('../src/lib/settings');
const { resolveActiveSessionPath } = require('../src/lib/state');

// NEW
const { resolveSetting } = require('../src/lib/config/setting-resolver');
const { resolveProjectRoot } = require('../src/lib/core/project-root-resolver');
const { resolveActiveSessionPath } = require('../src/lib/state/session-state');
```

**Step 6: Commit**

```bash
git add scripts/
git commit -m "refactor: update scripts to import from reorganized src/lib"
```

---

### Task 9: Update and reorganize unit tests

Tests are renamed and split to match the new module structure. The old `test-constants.js` is dissolved — its assertions migrate to the test files of the modules that now own those constants.

**Files:**
- Delete: `tests/unit/test-constants.js`
- Rename: `tests/unit/test-logger.js` (update path reference in fatal test)
- Rename: `tests/unit/test-file-utils.js` → `tests/unit/test-atomic-write.js`
- Rename: `tests/unit/test-response.js` → `tests/unit/test-hook-response.js`
- Rename: `tests/unit/test-process.js` → `tests/unit/test-process-runner.js`
- Rename: `tests/unit/test-concurrency.js` → `tests/unit/test-concurrency-limiter.js`
- Rename: `tests/unit/test-state.js` → `tests/unit/test-session-state.js`
- Rename: `tests/unit/test-hook-state.js` (update import path)
- Rename: `tests/unit/test-maestro.js` → `tests/unit/test-hook-facade.js`
- Split: `tests/unit/test-stdin.js` → `tests/unit/test-stdin-reader.js` (drop `get`/`getBool` tests)
- Split: `tests/unit/test-settings.js` → `tests/unit/test-env-file-parser.js` + `tests/unit/test-setting-resolver.js` + `tests/unit/test-project-root-resolver.js`
- Split: `tests/unit/test-validation.js` → `tests/unit/test-session-id-validator.js` + `tests/unit/test-agent-registry.js`
- Split: `tests/unit/test-dispatch-config.js` → `tests/unit/test-integer-parser.js` + `tests/unit/test-dispatch-config-resolver.js`
- Modify: `tests/helpers/defineHook-helper.js`
- Modify: `tests/helpers/parse-int-helper.js`

**Step 1: Update `tests/helpers/defineHook-helper.js`**

Change:
```js
const { defineHook } = require('../../src/lib/maestro');
```
to:
```js
const { defineHook } = require('../../src/lib/hooks/hook-facade');
```

**Step 2: Update `tests/helpers/parse-int-helper.js`**

Change:
```js
const { parsePositiveInteger, parseNonNegativeInteger } = require('../../src/lib/dispatch-config');
```
to:
```js
const { parsePositiveInteger, parseNonNegativeInteger } = require('../../src/lib/core/integer-parser');
```

**Step 3: Create `tests/unit/test-atomic-write.js`**

Same content as `tests/unit/test-file-utils.js`. Change import:
```js
const { atomicWriteSync } = require('../../src/lib/core/atomic-write');
```

**Step 4: Create `tests/unit/test-stdin-reader.js`**

From `tests/unit/test-stdin.js` — keep only `readJson()` and `readText()` describe blocks. Drop `get()` and `getBool()` tests. Update harness paths:

```js
const READJSON_HARNESS = path.resolve(__dirname, '..', '..', 'src', 'lib', 'core', 'stdin-reader.js');
```
```js
const STDIN_HARNESS = path.resolve(__dirname, '..', '..', 'src', 'lib', 'core', 'stdin-reader.js');
```

Remove the import of `get` and `getBool`. The `require` line at top changes to:
```js
// No top-level require needed — harness paths used in subprocess scripts
```

**Step 5: Create `tests/unit/test-env-file-parser.js`**

From `tests/unit/test-settings.js` — extract the `parseEnvFile()` describe block. Change import:
```js
const { parseEnvFile } = require('../../src/lib/core/env-file-parser');
```

**Step 6: Create `tests/unit/test-setting-resolver.js`**

From `tests/unit/test-settings.js` — extract the `resolveSetting()` describe block. Change import:
```js
const { resolveSetting } = require('../../src/lib/config/setting-resolver');
```

**Step 7: Create `tests/unit/test-project-root-resolver.js`**

From `tests/unit/test-settings.js` — extract the `resolveProjectRoot()` describe block. Change import:
```js
const { resolveProjectRoot } = require('../../src/lib/core/project-root-resolver');
```

**Step 8: Create `tests/unit/test-session-id-validator.js`**

From `tests/unit/test-validation.js` — extract the `validateSessionId()` describe block. Change import:
```js
const { validateSessionId } = require('../../src/lib/state/session-id-validator');
```

Call function directly (not `validation.validateSessionId`):
```js
assert.equal(validateSessionId('test-session_123'), true);
```

**Step 9: Create `tests/unit/test-agent-registry.js`**

From `tests/unit/test-validation.js` — extract the `detectAgentFromPrompt()` describe block. Change import:
```js
const { KNOWN_AGENTS, detectAgentFromPrompt } = require('../../src/lib/core/agent-registry');
```

Call function directly (not `validation.detectAgentFromPrompt`). Also add the KNOWN_AGENTS tests previously in `test-constants.js`:

```js
describe('KNOWN_AGENTS', () => {
  it('is a frozen array of 12 agents', () => {
    assert.ok(Array.isArray(KNOWN_AGENTS));
    assert.equal(KNOWN_AGENTS.length, 12);
    assert.ok(Object.isFrozen(KNOWN_AGENTS));
    assert.ok(KNOWN_AGENTS.includes('coder'));
    assert.ok(KNOWN_AGENTS.includes('architect'));
    assert.ok(KNOWN_AGENTS.includes('tester'));
  });
});
```

**Step 10: Create `tests/unit/test-integer-parser.js`**

From `tests/unit/test-dispatch-config.js` — extract `isStrictInteger()`, `parsePositiveInteger()`, `parseNonNegativeInteger()` describe blocks. Change import:
```js
const { isStrictInteger, parsePositiveInteger, parseNonNegativeInteger } = require('../../src/lib/core/integer-parser');
```

**Step 11: Create `tests/unit/test-dispatch-config-resolver.js`**

From `tests/unit/test-dispatch-config.js` — extract `resolveDispatchConfig()` describe block. Change import:
```js
const { resolveDispatchConfig } = require('../../src/lib/config/dispatch-config-resolver');
```

**Step 12: Update remaining test files (import paths only)**

- `tests/unit/test-logger.js`: Change import to `require('../../src/lib/core/logger')` and update `loggerPath` in fatal test to `path.resolve(__dirname, '..', '..', 'src', 'lib', 'core', 'logger.js')`
- `tests/unit/test-hook-response.js` (renamed from test-response.js): Change import to `require('../../src/lib/hooks/hook-response')`
- `tests/unit/test-process-runner.js` (renamed from test-process.js): Change import to `require('../../src/lib/dispatch/process-runner')`
- `tests/unit/test-concurrency-limiter.js` (renamed from test-concurrency.js): Change import to `require('../../src/lib/dispatch/concurrency-limiter')`
- `tests/unit/test-session-state.js` (renamed from test-state.js): Change import to `require('../../src/lib/state/session-state')`
- `tests/unit/test-hook-state.js`: Change import to `require('../../src/lib/hooks/hook-state')`
- `tests/unit/test-hook-facade.js` (renamed from test-maestro.js): Change import to `require('../../src/lib/hooks/hook-facade')`

**Step 13: Commit**

```bash
git add tests/
git commit -m "refactor: reorganize tests to match new src/lib module structure"
```

---

### Task 10: Delete old src/lib files

After all consumers point to new modules, delete the original flat files.

**Files:**
- Delete: `src/lib/constants.js`
- Delete: `src/lib/settings.js`
- Delete: `src/lib/stdin.js`
- Delete: `src/lib/validation.js`
- Delete: `src/lib/dispatch-config.js`
- Delete: `src/lib/response.js`
- Delete: `src/lib/process.js`
- Delete: `src/lib/maestro.js`
- Delete: `src/lib/file-utils.js`
- Delete: `src/lib/concurrency.js`
- Delete: `src/lib/state.js`
- Delete: `src/lib/hook-state.js`
- Delete: `src/lib/logger.js`

Also delete old test files that were renamed/split:
- Delete: `tests/unit/test-constants.js`
- Delete: `tests/unit/test-file-utils.js`
- Delete: `tests/unit/test-stdin.js`
- Delete: `tests/unit/test-settings.js`
- Delete: `tests/unit/test-validation.js`
- Delete: `tests/unit/test-dispatch-config.js`
- Delete: `tests/unit/test-response.js`
- Delete: `tests/unit/test-process.js`
- Delete: `tests/unit/test-concurrency.js`
- Delete: `tests/unit/test-state.js`
- Delete: `tests/unit/test-maestro.js`

**Step 1: Delete old src/lib files**

```bash
git rm src/lib/constants.js src/lib/settings.js src/lib/stdin.js src/lib/validation.js src/lib/dispatch-config.js src/lib/response.js src/lib/process.js src/lib/maestro.js src/lib/file-utils.js src/lib/concurrency.js src/lib/state.js src/lib/hook-state.js src/lib/logger.js
```

**Step 2: Delete old test files**

```bash
git rm tests/unit/test-constants.js tests/unit/test-file-utils.js tests/unit/test-stdin.js tests/unit/test-settings.js tests/unit/test-validation.js tests/unit/test-dispatch-config.js tests/unit/test-response.js tests/unit/test-process.js tests/unit/test-concurrency.js tests/unit/test-state.js tests/unit/test-maestro.js
```

**Step 3: Commit**

```bash
git commit -m "refactor: remove old flat src/lib modules and corresponding tests"
```

---

### Task 11: Run full test suite and validate

**Step 1: Run all tests**

```bash
node tests/run-all.js
```

Expected: All tests pass (same count as before — some files split, but total test cases preserved).

**Step 2: Verify no lingering references to old paths**

```bash
grep -r "require.*src/lib/constants\|require.*src/lib/settings\|require.*src/lib/stdin\|require.*src/lib/validation\|require.*src/lib/dispatch-config\|require.*src/lib/response\|require.*src/lib/process\|require.*src/lib/maestro\|require.*src/lib/file-utils\|require.*src/lib/concurrency\|require.*src/lib/state\|require.*src/lib/hook-state\|require.*src/lib/logger" --include="*.js" .
```

Expected: No matches (all old import paths have been migrated).

**Step 3: If tests fail, fix and re-run until green**

---

### Task 12: Update documentation

**Files:**
- Modify: `CLAUDE.md` (source-of-truth file list, hook contract references)
- Modify: `CHANGELOG.md` (add entry for reorganization)

**Step 1: Update CLAUDE.md**

In the "Source-of-Truth Files" section, replace:
```
- `src/lib/*.js`
```
with:
```
- `src/lib/core/*.js`
- `src/lib/config/*.js`
- `src/lib/hooks/*.js`
- `src/lib/state/*.js`
- `src/lib/dispatch/*.js`
```

In the "Project Overview" section, update the `src/lib` bullet to describe the new structure.

**Step 2: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: update CLAUDE.md and CHANGELOG.md for src/lib reorganization"
```

---

## Execution Strategy

### Dependency Graph

```
Task 1 (dirs)
  └─→ Task 2 (core/)
        ├─→ Task 3 (state/)  ──┐
        ├─→ Task 4 (config/) ──┤
        └─→ Task 6 (dispatch/) ┤
                                ├─→ Task 5 (hooks/) ─→ Task 7 (hook consumers)
                                │                      Task 8 (script consumers)
                                │                      Task 9 (tests)
                                │                        └─→ Task 10 (delete old)
                                │                              └─→ Task 11 (validate)
                                │                                    └─→ Task 12 (docs)
```

### Risk Classification

| Task | Risk | Rationale |
|------|------|-----------|
| 1-6 | LOW | Creating new files alongside old — no breakage possible |
| 7-8 | MEDIUM | Changing import paths in consumers — tests catch errors |
| 9 | MEDIUM | Splitting tests — must preserve all assertions |
| 10 | HIGH | Deleting old files — point of no return (git provides rollback) |
| 11 | LOW | Validation only |
| 12 | LOW | Documentation |

### Parallel Opportunities

- Tasks 3, 4, 6 can run in parallel (all depend only on Task 2, no shared files)
- Tasks 7, 8 can run in parallel (modify different file sets)
- Task 9 can be parallelized by test file (each test file is independent)

### Token Optimization

- Files that are unchanged moves: reference original, don't repeat content
- Group `git rm` commands to avoid per-file subprocess overhead
- Pre-specify all file paths — no exploration needed
