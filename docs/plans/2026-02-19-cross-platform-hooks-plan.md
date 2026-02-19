# Cross-Platform Hooks & Scripts — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite all bash + python3 hooks and scripts to pure Node.js for Windows PowerShell compatibility.

**Architecture:** Layered module architecture — shared `src/lib/` modules composed by thin `hooks/*.js` and `scripts/*.js` entry points. Zero npm dependencies. See `docs/plans/2026-02-19-cross-platform-hooks-design.md` for full design.

**Tech Stack:** Node.js (stdlib only: `fs`, `path`, `os`, `child_process`, `readline`, `node:test`, `node:assert`)

---

## Execution Strategy

### Dependency Graph

```
Stage 1 (lib modules - all independent):
  constants.js ──┐
  logger.js ─────┤
  response.js ───┤──> Stage 2 (entry points depend on lib)
  stdin.js ──────┤
  validation.js ─┤  (imports constants.js)
  settings.js ───┤
  state.js ──────┤
  hook-state.js ─┤  (imports logger.js, validation.js)
  process.js ────┘  (imports logger.js)

Stage 2 (hooks + scripts - depend on Stage 1):
  session-start.js ─┐
  session-end.js ────┤
  before-agent.js ───┤──> Stage 3 (tests + cleanup)
  after-agent.js ────┤
  hooks.json ────────┤
  ensure-workspace.js┤
  read-state.js ─────┤
  write-state.js ────┤
  read-active-session.js ─┤
  parallel-dispatch.js ───┘

Stage 3 (validation):
  test migration ──> cleanup .sh files ──> doc updates ──> version bump
```

### Agent Allocation

| Stage | Tasks | Execution | Agent | Model |
|-------|-------|-----------|-------|-------|
| 1a | constants, logger, response | Parallel (3 agents) | Coder | haiku |
| 1b | stdin, validation, settings | Parallel (3 agents) | Coder | sonnet |
| 1c | state, hook-state, process | Parallel (3 agents) | Coder | sonnet |
| 2a | session-start, session-end, hooks.json | Parallel (3 agents) | Coder | haiku |
| 2b | before-agent, after-agent | Parallel (2 agents) | Coder | sonnet |
| 2c | ensure-workspace, read-state, write-state | Parallel (3 agents) | Coder | haiku |
| 2d | read-active-session | Sequential | Coder | sonnet |
| 2e | parallel-dispatch | Sequential (ME) | — | — |
| 3a | test migration | Sequential (ME) | — | — |
| 3b | delete .sh, update docs, version bump | Sequential (ME) | — | — |

### Validation Checkpoints

- After Stage 1: `node --test tests/unit/` (all lib unit tests pass)
- After Stage 2: `bash tests/run-all.sh` (all integration tests pass)
- After Stage 3: `bash tests/run-all.sh` (final validation, no .sh scripts remain)

---

## Task 1: Constants Module

**Files:**
- Create: `src/lib/constants.js`
- Test: `tests/unit/test-constants.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-constants.js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const constants = require('../../src/lib/constants');

describe('constants', () => {
  it('exports KNOWN_AGENTS as a frozen array of 12 agents', () => {
    assert.ok(Array.isArray(constants.KNOWN_AGENTS));
    assert.equal(constants.KNOWN_AGENTS.length, 12);
    assert.ok(Object.isFrozen(constants.KNOWN_AGENTS));
    assert.ok(constants.KNOWN_AGENTS.includes('coder'));
    assert.ok(constants.KNOWN_AGENTS.includes('architect'));
    assert.ok(constants.KNOWN_AGENTS.includes('tester'));
  });

  it('exports DEFAULT_STATE_DIR as .gemini', () => {
    assert.equal(constants.DEFAULT_STATE_DIR, '.gemini');
  });

  it('exports numeric defaults', () => {
    assert.equal(constants.DEFAULT_TIMEOUT_MINS, 10);
    assert.equal(constants.DEFAULT_STAGGER_DELAY, 5);
    assert.equal(constants.HOOK_STATE_TTL_MS, 7200000);
    assert.equal(constants.MAX_PROMPT_SIZE_BYTES, 1000000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-constants.js`
Expected: FAIL — `Cannot find module '../../src/lib/constants'`

**Step 3: Write minimal implementation**

```js
// src/lib/constants.js
'use strict';

const KNOWN_AGENTS = Object.freeze([
  'architect',
  'api-designer',
  'code-reviewer',
  'coder',
  'data-engineer',
  'debugger',
  'devops-engineer',
  'performance-engineer',
  'refactor',
  'security-engineer',
  'technical-writer',
  'tester',
]);

const DEFAULT_STATE_DIR = '.gemini';
const DEFAULT_TIMEOUT_MINS = 10;
const DEFAULT_STAGGER_DELAY = 5;
const HOOK_STATE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PROMPT_SIZE_BYTES = 1_000_000;

module.exports = {
  KNOWN_AGENTS,
  DEFAULT_STATE_DIR,
  DEFAULT_TIMEOUT_MINS,
  DEFAULT_STAGGER_DELAY,
  HOOK_STATE_TTL_MS,
  MAX_PROMPT_SIZE_BYTES,
};
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-constants.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/constants.js tests/unit/test-constants.js
git commit -m "feat: add constants module for cross-platform rewrite"
```

---

## Task 2: Logger Module

**Files:**
- Create: `src/lib/logger.js`
- Test: `tests/unit/test-logger.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-logger.js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../../src/lib/logger');

describe('logger', () => {
  it('exports a log function', () => {
    assert.equal(typeof logger.log, 'function');
  });

  it('writes formatted message to stderr', () => {
    const original = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += chunk; return true; };
    try {
      logger.log('INFO', 'test message');
      assert.equal(captured, '[INFO] maestro: test message\n');
    } finally {
      process.stderr.write = original;
    }
  });

  it('handles WARN level', () => {
    const original = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += chunk; return true; };
    try {
      logger.log('WARN', 'something wrong');
      assert.equal(captured, '[WARN] maestro: something wrong\n');
    } finally {
      process.stderr.write = original;
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-logger.js`
Expected: FAIL — `Cannot find module '../../src/lib/logger'`

**Step 3: Write minimal implementation**

```js
// src/lib/logger.js
'use strict';

function log(level, message) {
  process.stderr.write(`[${level}] maestro: ${message}\n`);
}

module.exports = { log };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-logger.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/logger.js tests/unit/test-logger.js
git commit -m "feat: add logger module for cross-platform rewrite"
```

---

## Task 3: Response Module

**Files:**
- Create: `src/lib/response.js`
- Test: `tests/unit/test-response.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-response.js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const response = require('../../src/lib/response');

describe('response', () => {
  it('allow() returns decision:allow JSON', () => {
    assert.equal(response.allow(), '{"decision":"allow"}');
  });

  it('deny(reason) returns decision:deny with reason', () => {
    const result = JSON.parse(response.deny('bad format'));
    assert.equal(result.decision, 'deny');
    assert.equal(result.reason, 'bad format');
  });

  it('allowWithContext() returns allow with hookSpecificOutput', () => {
    const result = JSON.parse(response.allowWithContext('phase=2', 'BeforeAgent'));
    assert.equal(result.decision, 'allow');
    assert.equal(result.hookSpecificOutput.hookEventName, 'BeforeAgent');
    assert.equal(result.hookSpecificOutput.additionalContext, 'phase=2');
  });

  it('allowWithContext() defaults hookEventName to BeforeAgent', () => {
    const result = JSON.parse(response.allowWithContext('ctx'));
    assert.equal(result.hookSpecificOutput.hookEventName, 'BeforeAgent');
  });

  it('advisory() returns empty object JSON', () => {
    assert.equal(response.advisory(), '{}');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-response.js`
Expected: FAIL — `Cannot find module '../../src/lib/response'`

**Step 3: Write minimal implementation**

```js
// src/lib/response.js
'use strict';

function allow() {
  return JSON.stringify({ decision: 'allow' });
}

function deny(reason) {
  return JSON.stringify({ decision: 'deny', reason });
}

function allowWithContext(context, hookEventName = 'BeforeAgent') {
  return JSON.stringify({
    decision: 'allow',
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context,
    },
  });
}

function advisory() {
  return '{}';
}

module.exports = { allow, deny, allowWithContext, advisory };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-response.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/response.js tests/unit/test-response.js
git commit -m "feat: add response module for cross-platform rewrite"
```

---

## Task 4: Stdin Module

**Files:**
- Create: `src/lib/stdin.js`
- Test: `tests/unit/test-stdin.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-stdin.js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { get, getBool, getNested } = require('../../src/lib/stdin');

describe('stdin helpers', () => {
  describe('get()', () => {
    it('returns value for existing key', () => {
      assert.equal(get({ foo: 'bar' }, 'foo'), 'bar');
    });

    it('returns empty string for missing key', () => {
      assert.equal(get({ foo: 'bar' }, 'baz'), '');
    });

    it('returns empty string for null obj', () => {
      assert.equal(get(null, 'foo'), '');
    });
  });

  describe('getBool()', () => {
    it('returns true for truthy value', () => {
      assert.equal(getBool({ a: true }, 'a'), true);
    });

    it('returns true for string "true"', () => {
      assert.equal(getBool({ a: 'true' }, 'a'), true);
    });

    it('returns false for missing key', () => {
      assert.equal(getBool({ a: true }, 'b'), false);
    });

    it('returns false for falsy value', () => {
      assert.equal(getBool({ a: false }, 'a'), false);
    });
  });

  describe('getNested()', () => {
    it('traverses nested objects', () => {
      const obj = { a: { b: { c: 'deep' } } };
      assert.equal(getNested(obj, 'a', 'b', 'c'), 'deep');
    });

    it('returns empty string for missing path', () => {
      assert.equal(getNested({ a: { b: 1 } }, 'a', 'x', 'y'), '');
    });

    it('returns JSON for non-string leaf', () => {
      const obj = { a: { b: [1, 2] } };
      assert.equal(getNested(obj, 'a', 'b'), '[1,2]');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-stdin.js`
Expected: FAIL — `Cannot find module '../../src/lib/stdin'`

**Step 3: Write minimal implementation**

```js
// src/lib/stdin.js
'use strict';

function readJson() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }

    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const raw = chunks.join('');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    process.stdin.resume();
  });
}

function get(obj, key) {
  if (obj == null || typeof obj !== 'object') return '';
  const val = obj[key];
  return val == null ? '' : val;
}

function getBool(obj, key) {
  if (obj == null || typeof obj !== 'object') return false;
  const val = obj[key];
  if (val === true || val === 'true') return true;
  return false;
}

function getNested(obj, ...keys) {
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return '';
    current = current[key];
  }
  if (current == null) return '';
  if (typeof current === 'string') return current;
  return JSON.stringify(current);
}

module.exports = { readJson, get, getBool, getNested };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-stdin.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/stdin.js tests/unit/test-stdin.js
git commit -m "feat: add stdin module for cross-platform rewrite"
```

---

## Task 5: Validation Module

**Files:**
- Create: `src/lib/validation.js`
- Test: `tests/unit/test-validation.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-validation.js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../../src/lib/validation');

describe('validateSessionId()', () => {
  it('accepts alphanumeric with hyphens and underscores', () => {
    assert.equal(validation.validateSessionId('test-session_123'), true);
  });

  it('rejects path traversal', () => {
    assert.equal(validation.validateSessionId('../../../etc'), false);
  });

  it('rejects empty string', () => {
    assert.equal(validation.validateSessionId(''), false);
  });

  it('rejects spaces', () => {
    assert.equal(validation.validateSessionId('has space'), false);
  });

  it('rejects null/undefined', () => {
    assert.equal(validation.validateSessionId(null), false);
    assert.equal(validation.validateSessionId(undefined), false);
  });
});

describe('detectAgentFromPrompt()', () => {
  it('returns agent for "delegate to tester" pattern', () => {
    assert.equal(validation.detectAgentFromPrompt('delegate to tester to run tests'), 'tester');
  });

  it('returns agent for "dispatch coder" pattern', () => {
    assert.equal(validation.detectAgentFromPrompt('dispatch coder for implementation'), 'coder');
  });

  it('returns agent for "@architect" pattern', () => {
    assert.equal(validation.detectAgentFromPrompt('Handing off to @architect'), 'architect');
  });

  it('returns agent for "hand off to the security-engineer" pattern', () => {
    assert.equal(
      validation.detectAgentFromPrompt('hand off to the security-engineer for review'),
      'security-engineer'
    );
  });

  it('returns empty string for no delegation pattern', () => {
    assert.equal(
      validation.detectAgentFromPrompt('You are the tester agent. Run the test suite.'),
      ''
    );
  });

  it('returns empty string for empty prompt', () => {
    assert.equal(validation.detectAgentFromPrompt(''), '');
  });

  it('is case-insensitive', () => {
    assert.equal(validation.detectAgentFromPrompt('DELEGATE TO CODER now'), 'coder');
  });

  it('prefers MAESTRO_CURRENT_AGENT env when set', () => {
    const orig = process.env.MAESTRO_CURRENT_AGENT;
    process.env.MAESTRO_CURRENT_AGENT = 'debugger';
    try {
      assert.equal(validation.detectAgentFromPrompt('delegate to coder'), 'debugger');
    } finally {
      if (orig === undefined) delete process.env.MAESTRO_CURRENT_AGENT;
      else process.env.MAESTRO_CURRENT_AGENT = orig;
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-validation.js`
Expected: FAIL — `Cannot find module '../../src/lib/validation'`

**Step 3: Write minimal implementation**

```js
// src/lib/validation.js
'use strict';

const { KNOWN_AGENTS } = require('./constants');

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateSessionId(id) {
  if (id == null || typeof id !== 'string') return false;
  return SESSION_ID_PATTERN.test(id);
}

function detectAgentFromPrompt(prompt) {
  const envAgent = process.env.MAESTRO_CURRENT_AGENT;
  if (envAgent) return envAgent;

  if (!prompt) return '';

  const lower = prompt.toLowerCase();
  for (const agent of KNOWN_AGENTS) {
    const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const delegationPatterns = [
      new RegExp(`(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?${escaped}\\b`),
      new RegExp(`@${escaped}\\b`),
    ];
    if (delegationPatterns.some((p) => p.test(lower))) {
      return agent;
    }
  }

  return '';
}

module.exports = { validateSessionId, detectAgentFromPrompt };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-validation.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/validation.js tests/unit/test-validation.js
git commit -m "feat: add validation module for cross-platform rewrite"
```

---

## Task 6: Settings Module

**Files:**
- Create: `src/lib/settings.js`
- Test: `tests/unit/test-settings.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-settings.js
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const settings = require('../../src/lib/settings');

describe('parseEnvFile()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-settings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses simple key=value', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO=bar\nBAZ=qux\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result.BAZ, 'qux');
  });

  it('strips double quotes', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO="hello world"\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'hello world');
  });

  it('strips single quotes', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, "FOO='hello world'\n");
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'hello world');
  });

  it('ignores comments and blank lines', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, '# comment\n\nFOO=bar\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(Object.keys(result).length, 1);
  });

  it('returns empty object for missing file', () => {
    const result = settings.parseEnvFile(path.join(tmpDir, 'nonexistent'));
    assert.deepEqual(result, {});
  });

  it('last value wins for duplicate keys', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO=first\nFOO=second\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'second');
  });
});

describe('resolveSetting()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-resolve-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TEST_MAESTRO_VAR;
  });

  it('prefers env var when set', () => {
    process.env.TEST_MAESTRO_VAR = 'from-env';
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-env');
  });

  it('falls back to project .env', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_MAESTRO_VAR=from-project\n');
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-project');
  });

  it('returns undefined when not found anywhere', () => {
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, undefined);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-settings.js`
Expected: FAIL — `Cannot find module '../../src/lib/settings'`

**Step 3: Write minimal implementation**

```js
// src/lib/settings.js
'use strict';

const fs = require('fs');
const path = require('path');

function trimQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
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
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const rawValue = trimmed.slice(eqIndex + 1);
    result[key] = trimQuotes(rawValue);
  }
  return result;
}

function resolveSetting(varName, projectRoot) {
  const envValue = process.env[varName];
  if (envValue !== undefined && envValue !== '') return envValue;

  const projectEnv = parseEnvFile(path.join(projectRoot, '.env'));
  if (projectEnv[varName] !== undefined) return projectEnv[varName];

  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH ||
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.gemini', 'extensions', 'maestro');
  const extEnv = parseEnvFile(path.join(extensionRoot, '.env'));
  if (extEnv[varName] !== undefined) return extEnv[varName];

  return undefined;
}

module.exports = { parseEnvFile, resolveSetting };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-settings.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/settings.js tests/unit/test-settings.js
git commit -m "feat: add settings module for cross-platform rewrite"
```

---

## Task 7: State Module

**Files:**
- Create: `src/lib/state.js`
- Test: `tests/unit/test-state.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-state.js
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('../../src/lib/state');

describe('resolveActiveSessionPath()', () => {
  it('uses default .gemini when MAESTRO_STATE_DIR is unset', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    delete process.env.MAESTRO_STATE_DIR;
    try {
      const result = state.resolveActiveSessionPath('/project');
      assert.equal(result, path.join('/project', '.gemini', 'state', 'active-session.md'));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
    }
  });

  it('uses MAESTRO_STATE_DIR when set to relative path', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    process.env.MAESTRO_STATE_DIR = '.maestro';
    try {
      const result = state.resolveActiveSessionPath('/project');
      assert.equal(result, path.join('/project', '.maestro', 'state', 'active-session.md'));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
      else delete process.env.MAESTRO_STATE_DIR;
    }
  });

  it('uses MAESTRO_STATE_DIR when set to absolute path', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    process.env.MAESTRO_STATE_DIR = '/abs/path';
    try {
      const result = state.resolveActiveSessionPath('/project');
      assert.equal(result, path.join('/abs/path', 'state', 'active-session.md'));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
      else delete process.env.MAESTRO_STATE_DIR;
    }
  });

  it('uses cwd when cwd is empty and state dir is relative', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    delete process.env.MAESTRO_STATE_DIR;
    try {
      const result = state.resolveActiveSessionPath('');
      assert.ok(result.endsWith(path.join('.gemini', 'state', 'active-session.md')));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
    }
  });
});

describe('hasActiveSession()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-state-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.MAESTRO_STATE_DIR;
  });

  it('returns true when active-session.md exists', () => {
    const stateDir = path.join(tmpDir, '.gemini', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'active-session.md'), 'test');
    assert.equal(state.hasActiveSession(tmpDir), true);
  });

  it('returns false when file does not exist', () => {
    assert.equal(state.hasActiveSession(tmpDir), false);
  });
});

describe('readState()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-readstate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads file content at relative path', () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'sub', 'file.md'), 'hello');
    const content = state.readState('sub/file.md', tmpDir);
    assert.equal(content, 'hello');
  });

  it('throws for absolute path', () => {
    assert.throws(() => state.readState('/etc/passwd', tmpDir), /relative/i);
  });

  it('throws for path traversal', () => {
    assert.throws(() => state.readState('../escape/file', tmpDir), /traversal/i);
  });

  it('throws for missing file', () => {
    assert.throws(() => state.readState('nonexistent.md', tmpDir));
  });
});

describe('writeState()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-writestate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes content atomically', () => {
    state.writeState('output.md', 'content', tmpDir);
    const result = fs.readFileSync(path.join(tmpDir, 'output.md'), 'utf8');
    assert.equal(result, 'content');
  });

  it('creates parent directories', () => {
    state.writeState('deep/nested/file.md', 'data', tmpDir);
    const result = fs.readFileSync(path.join(tmpDir, 'deep', 'nested', 'file.md'), 'utf8');
    assert.equal(result, 'data');
  });

  it('throws for absolute path', () => {
    assert.throws(() => state.writeState('/abs/path', 'data', tmpDir), /relative/i);
  });

  it('throws for path traversal', () => {
    assert.throws(() => state.writeState('../escape', 'data', tmpDir), /traversal/i);
  });
});

describe('ensureWorkspace()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-workspace-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates all required directories', () => {
    state.ensureWorkspace('.gemini', tmpDir);
    const base = path.join(tmpDir, '.gemini');
    assert.ok(fs.existsSync(path.join(base, 'state')));
    assert.ok(fs.existsSync(path.join(base, 'state', 'archive')));
    assert.ok(fs.existsSync(path.join(base, 'plans')));
    assert.ok(fs.existsSync(path.join(base, 'plans', 'archive')));
    assert.ok(fs.existsSync(path.join(base, 'parallel')));
  });

  it('throws for absolute path', () => {
    assert.throws(() => state.ensureWorkspace('/abs', tmpDir), /relative/i);
  });

  it('throws for path traversal', () => {
    assert.throws(() => state.ensureWorkspace('..', tmpDir), /traversal/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-state.js`
Expected: FAIL — `Cannot find module '../../src/lib/state'`

**Step 3: Write minimal implementation**

```js
// src/lib/state.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DEFAULT_STATE_DIR } = require('./constants');

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error(`Path must be relative (got: ${filePath})`);
  }
  if (filePath.includes('..')) {
    throw new Error(`Path traversal not allowed (got: ${filePath})`);
  }
}

function resolveActiveSessionPath(cwd) {
  const stateDir = process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;

  if (path.isAbsolute(stateDir)) {
    return path.join(stateDir, 'state', 'active-session.md');
  }

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
  const parentDir = path.dirname(fullPath);
  fs.mkdirSync(parentDir, { recursive: true });
  const tmpFile = fullPath + `.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, content);
    fs.renameSync(tmpFile, fullPath);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

function ensureWorkspace(stateDir, basePath) {
  validateRelativePath(stateDir);
  const base = path.join(basePath, stateDir);
  const realBase = fs.existsSync(base) ? fs.realpathSync(base) : null;
  if (realBase && fs.lstatSync(base).isSymbolicLink()) {
    throw new Error(`STATE_DIR must not be a symlink (got: ${stateDir})`);
  }
  const dirs = [
    path.join(base, 'state'),
    path.join(base, 'state', 'archive'),
    path.join(base, 'plans'),
    path.join(base, 'plans', 'archive'),
    path.join(base, 'parallel'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
};
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-state.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/state.js tests/unit/test-state.js
git commit -m "feat: add state module for cross-platform rewrite"
```

---

## Task 8: Hook-State Module

**Files:**
- Create: `src/lib/hook-state.js`
- Test: `tests/unit/test-hook-state.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-hook-state.js
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const hookState = require('../../src/lib/hook-state');

describe('hook-state', () => {
  let origBaseDir;

  beforeEach(() => {
    origBaseDir = hookState._getBaseDir;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-hookstate-'));
    hookState._setBaseDirForTest(tmpDir);
  });

  afterEach(() => {
    const baseDir = hookState.getBaseDir();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  describe('setActiveAgent() / getActiveAgent()', () => {
    it('writes and reads agent name', () => {
      hookState.setActiveAgent('session-1', 'coder');
      assert.equal(hookState.getActiveAgent('session-1'), 'coder');
    });

    it('returns empty string for unknown session', () => {
      assert.equal(hookState.getActiveAgent('nonexistent'), '');
    });

    it('refuses invalid session ID', () => {
      assert.equal(hookState.setActiveAgent('../bad', 'coder'), false);
    });
  });

  describe('clearActiveAgent()', () => {
    it('removes the active agent file', () => {
      hookState.setActiveAgent('session-2', 'tester');
      hookState.clearActiveAgent('session-2');
      assert.equal(hookState.getActiveAgent('session-2'), '');
    });

    it('handles already-cleared session gracefully', () => {
      hookState.clearActiveAgent('nonexistent');
    });
  });

  describe('pruneStale()', () => {
    it('removes directories older than TTL', () => {
      const baseDir = hookState.getBaseDir();
      const staleDir = path.join(baseDir, 'stale-session');
      fs.mkdirSync(staleDir, { recursive: true });
      const pastTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
      fs.utimesSync(staleDir, pastTime, pastTime);
      hookState.pruneStale();
      assert.equal(fs.existsSync(staleDir), false);
    });

    it('preserves recent directories', () => {
      const baseDir = hookState.getBaseDir();
      const recentDir = path.join(baseDir, 'recent-session');
      fs.mkdirSync(recentDir, { recursive: true });
      hookState.pruneStale();
      assert.equal(fs.existsSync(recentDir), true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-hook-state.js`
Expected: FAIL — `Cannot find module '../../src/lib/hook-state'`

**Step 3: Write minimal implementation**

```js
// src/lib/hook-state.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./logger');
const { validateSessionId } = require('./validation');
const { HOOK_STATE_TTL_MS } = require('./constants');

let _baseDir = path.join(os.tmpdir(), 'maestro-hooks');

function getBaseDir() {
  return _baseDir;
}

function _setBaseDirForTest(dir) {
  _baseDir = dir;
}

function pruneStale() {
  const baseDir = getBaseDir();
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
      const stat = fs.statSync(dirPath);
      if (now - stat.mtimeMs > HOOK_STATE_TTL_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {}
  }
}

function setActiveAgent(sessionId, agentName) {
  if (!validateSessionId(sessionId)) {
    log('ERROR', `Invalid session_id: contains unsafe characters`);
    return false;
  }
  const baseDir = getBaseDir();
  const sessionDir = path.join(baseDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const agentFile = path.join(sessionDir, 'active-agent');
  const tmpFile = `${agentFile}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, agentName);
  fs.renameSync(tmpFile, agentFile);
  return true;
}

function getActiveAgent(sessionId) {
  if (!validateSessionId(sessionId)) return '';
  const agentFile = path.join(getBaseDir(), sessionId, 'active-agent');
  try {
    return fs.readFileSync(agentFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function clearActiveAgent(sessionId) {
  if (!validateSessionId(sessionId)) return;
  const agentFile = path.join(getBaseDir(), sessionId, 'active-agent');
  try {
    fs.unlinkSync(agentFile);
  } catch {}
}

module.exports = {
  getBaseDir,
  _setBaseDirForTest,
  pruneStale,
  setActiveAgent,
  getActiveAgent,
  clearActiveAgent,
};
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-hook-state.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/hook-state.js tests/unit/test-hook-state.js
git commit -m "feat: add hook-state module for cross-platform rewrite"
```

---

## Task 9: Process Module

**Files:**
- Create: `src/lib/process.js`
- Test: `tests/unit/test-process.js`

**Step 1: Write the failing test**

```js
// tests/unit/test-process.js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const processHelper = require('../../src/lib/process');

describe('runWithTimeout()', () => {
  it('runs a simple command and returns exit code 0', async () => {
    const result = await processHelper.runWithTimeout('node', ['-e', 'process.exit(0)'], {}, 5000);
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
  });

  it('captures non-zero exit code', async () => {
    const result = await processHelper.runWithTimeout('node', ['-e', 'process.exit(42)'], {}, 5000);
    assert.equal(result.exitCode, 42);
    assert.equal(result.timedOut, false);
  });

  it('times out long-running process', async () => {
    const result = await processHelper.runWithTimeout(
      'node', ['-e', 'setTimeout(() => {}, 30000)'], {}, 500
    );
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
  });

  it('pipes stdin content to child process', async () => {
    const { Readable } = require('stream');
    const stdinStream = Readable.from(['hello world']);
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const outFile = path.join(os.tmpdir(), `maestro-process-test-${process.pid}.txt`);
    try {
      const result = await processHelper.runWithTimeout(
        'node',
        ['-e', `const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{fs.writeFileSync('${outFile.replace(/\\/g, '\\\\')}',d);process.exit(0)})`],
        { stdin: stdinStream },
        5000
      );
      assert.equal(result.exitCode, 0);
      const content = fs.readFileSync(outFile, 'utf8');
      assert.equal(content, 'hello world');
    } finally {
      try { fs.unlinkSync(outFile); } catch {}
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/test-process.js`
Expected: FAIL — `Cannot find module '../../src/lib/process'`

**Step 3: Write minimal implementation**

```js
// src/lib/process.js
'use strict';

const { spawn, execSync } = require('child_process');
const { log } = require('./logger');

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {}
}

function forceKillProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {}
}

function runWithTimeout(command, args, options = {}, timeoutMs) {
  return new Promise((resolve) => {
    const { stdin: stdinStream, stdout: stdoutFile, stderr: stderrFile, cwd, env } = options;

    const spawnOptions = {
      stdio: [
        stdinStream ? 'pipe' : 'ignore',
        stdoutFile || 'ignore',
        stderrFile || 'ignore',
      ],
      cwd,
      env: env || process.env,
    };

    const child = spawn(command, args, spawnOptions);
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      log('WARN', `Process ${child.pid} timed out after ${timeoutMs}ms`);
      killProcess(child.pid);
      setTimeout(() => {
        try {
          process.kill(child.pid, 0);
          forceKillProcess(child.pid);
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
      resolve({
        exitCode: timedOut ? 124 : (code ?? 255),
        timedOut,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log('ERROR', `Process spawn error: ${err.message}`);
      resolve({ exitCode: 255, timedOut: false });
    });
  });
}

module.exports = { runWithTimeout };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/test-process.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/process.js tests/unit/test-process.js
git commit -m "feat: add process module for cross-platform rewrite"
```

---

## Task 10: Session-Start Hook

**Files:**
- Create: `hooks/session-start.js`
- Reference: `src/lib/stdin.js`, `src/lib/response.js`, `src/lib/validation.js`, `src/lib/hook-state.js`, `src/lib/state.js`, `src/lib/logger.js`

**Step 1: Write the implementation**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../src/lib/stdin');
const { advisory } = require('../src/lib/response');
const { validateSessionId } = require('../src/lib/validation');
const hookState = require('../src/lib/hook-state');
const { hasActiveSession } = require('../src/lib/state');
const { log } = require('../src/lib/logger');

async function main() {
  const input = await readJson();
  const sessionId = input.session_id || '';
  const cwd = input.cwd || '';

  hookState.pruneStale();

  if (!hasActiveSession(cwd)) {
    process.stdout.write(advisory() + '\n');
    return;
  }

  if (validateSessionId(sessionId)) {
    const baseDir = hookState.getBaseDir();
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true });
  }

  process.stdout.write(advisory() + '\n');
}

main().catch((err) => {
  log('ERROR', `Hook failed — returning safe default: ${err.message}`);
  process.stdout.write(advisory() + '\n');
});
```

**Step 2: Run integration test to verify it passes**

The test migration for this hook will happen in Task 18. For now, manual smoke test:

Run: `echo '{"session_id":"test-node-1","cwd":"/tmp","hook_event_name":"SessionStart"}' | node hooks/session-start.js 2>/dev/null`
Expected: `{}`

**Step 3: Commit**

```bash
git add hooks/session-start.js
git commit -m "feat: add Node.js session-start hook"
```

---

## Task 11: Session-End Hook

**Files:**
- Create: `hooks/session-end.js`

**Step 1: Write the implementation**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../src/lib/stdin');
const { advisory } = require('../src/lib/response');
const { validateSessionId } = require('../src/lib/validation');
const hookState = require('../src/lib/hook-state');
const { log } = require('../src/lib/logger');

async function main() {
  const input = await readJson();
  const sessionId = input.session_id || '';

  if (!validateSessionId(sessionId)) {
    process.stdout.write(advisory() + '\n');
    return;
  }

  const sessionDir = path.join(hookState.getBaseDir(), sessionId);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {}

  process.stdout.write(advisory() + '\n');
}

main().catch((err) => {
  log('ERROR', `Hook failed — returning safe default: ${err.message}`);
  process.stdout.write(advisory() + '\n');
});
```

**Step 2: Smoke test**

Run: `echo '{"session_id":"test-node-2","cwd":"/tmp"}' | node hooks/session-end.js 2>/dev/null`
Expected: `{}`

**Step 3: Commit**

```bash
git add hooks/session-end.js
git commit -m "feat: add Node.js session-end hook"
```

---

## Task 12: Before-Agent Hook

**Files:**
- Create: `hooks/before-agent.js`

**Step 1: Write the implementation**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { readJson } = require('../src/lib/stdin');
const { allow, allowWithContext } = require('../src/lib/response');
const { validateSessionId, detectAgentFromPrompt } = require('../src/lib/validation');
const hookState = require('../src/lib/hook-state');
const { resolveActiveSessionPath } = require('../src/lib/state');
const { log } = require('../src/lib/logger');

async function main() {
  const input = await readJson();
  const sessionId = input.session_id || '';
  const cwd = input.cwd || '';
  const prompt = input.prompt || '';
  const hookEventName = input.hook_event_name || 'BeforeAgent';

  hookState.pruneStale();

  const agentName = detectAgentFromPrompt(prompt);

  if (agentName && validateSessionId(sessionId)) {
    hookState.setActiveAgent(sessionId, agentName);
    log('INFO', `BeforeAgent: Detected agent '${agentName}' — set active agent [session=${sessionId}]`);
  }

  const sessionPath = resolveActiveSessionPath(cwd);
  let contextParts = '';

  try {
    if (fs.existsSync(sessionPath)) {
      const content = fs.readFileSync(sessionPath, 'utf8');
      const parts = [];
      const phaseMatch = content.match(/current_phase:\s*(\S+)/);
      if (phaseMatch) parts.push(`current_phase=${phaseMatch[1]}`);
      const statusMatch = content.match(/status:\s*(\S+)/);
      if (statusMatch) parts.push(`status=${statusMatch[1]}`);
      if (parts.length > 0) {
        contextParts = `Active session: ${parts.join(', ')}`;
      }
    }
  } catch {}

  if (contextParts) {
    process.stdout.write(allowWithContext(contextParts, hookEventName) + '\n');
  } else {
    process.stdout.write(allow() + '\n');
  }
}

main().catch((err) => {
  log('ERROR', `Hook failed — returning safe default: ${err.message}`);
  process.stdout.write(allow() + '\n');
});
```

**Step 2: Smoke test**

Run: `echo '{"session_id":"test-ba-node","cwd":"/tmp","prompt":"delegate to coder","hook_event_name":"BeforeAgent"}' | node hooks/before-agent.js 2>/dev/null`
Expected: `{"decision":"allow"}`

**Step 3: Commit**

```bash
git add hooks/before-agent.js
git commit -m "feat: add Node.js before-agent hook"
```

---

## Task 13: After-Agent Hook

**Files:**
- Create: `hooks/after-agent.js`

**Step 1: Write the implementation**

```js
#!/usr/bin/env node
'use strict';

const { readJson, getBool } = require('../src/lib/stdin');
const { allow, deny } = require('../src/lib/response');
const hookState = require('../src/lib/hook-state');
const { log } = require('../src/lib/logger');

async function main() {
  const input = await readJson();
  const sessionId = input.session_id || '';
  const stopHookActive = getBool(input, 'stop_hook_active');

  const agentName = hookState.getActiveAgent(sessionId);
  const agentLower = agentName.toLowerCase();

  if (agentName && agentLower !== 'techlead' && agentLower !== 'orchestrator') {
    const promptResponse = input.prompt_response || '';
    const hasTaskReport = promptResponse.includes('## Task Report') || promptResponse.includes('# Task Report');
    const hasDownstream = promptResponse.includes('## Downstream Context') || promptResponse.includes('# Downstream Context');

    const warnings = [];
    if (!hasTaskReport) warnings.push('Missing Task Report section (expected ## Task Report heading)');
    if (!hasDownstream) warnings.push('Missing Downstream Context section (expected ## Downstream Context heading)');

    if (warnings.length > 0) {
      const reason = warnings.join('; ');
      if (stopHookActive) {
        log('WARN', `AfterAgent [${agentName}]: Retry still malformed: ${reason} — allowing to prevent infinite loop`);
      } else {
        log('WARN', `AfterAgent [${agentName}]: WARN: ${reason} — requesting retry`);
        hookState.clearActiveAgent(sessionId);
        process.stdout.write(deny(`Handoff report validation failed: ${reason}. Please include both a ## Task Report section and a ## Downstream Context section in your response.`) + '\n');
        return;
      }
    } else {
      log('INFO', `AfterAgent [${agentName}]: Handoff report validated`);
    }
  }

  hookState.clearActiveAgent(sessionId);
  process.stdout.write(allow() + '\n');
}

main().catch((err) => {
  log('ERROR', `Hook failed — returning safe default: ${err.message}`);
  process.stdout.write(allow() + '\n');
});
```

**Step 2: Smoke test**

Run: `echo '{"session_id":"test-aa-node","prompt_response":"## Task Report\nDone\n## Downstream Context\nNone"}' | node hooks/after-agent.js 2>/dev/null`
Expected: `{"decision":"allow"}`

**Step 3: Commit**

```bash
git add hooks/after-agent.js
git commit -m "feat: add Node.js after-agent hook"
```

---

## Task 14: Update hooks.json

**Files:**
- Modify: `hooks/hooks.json`

**Step 1: Update the hook commands from bash to node**

Replace:
```json
"command": "bash ${extensionPath}/hooks/before-agent.sh"
```
With:
```json
"command": "node ${extensionPath}/hooks/before-agent.js"
```

Replace:
```json
"command": "bash ${extensionPath}/hooks/after-agent.sh"
```
With:
```json
"command": "node ${extensionPath}/hooks/after-agent.js"
```

**Step 2: Verify valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: update hooks.json to use Node.js hooks"
```

---

## Task 15: Script Entry Points (ensure-workspace, read-state, write-state)

**Files:**
- Create: `scripts/ensure-workspace.js`
- Create: `scripts/read-state.js`
- Create: `scripts/write-state.js`

**Step 1: Write ensure-workspace.js**

```js
#!/usr/bin/env node
'use strict';

const { ensureWorkspace } = require('../src/lib/state');

const stateDir = process.argv[2] || '.gemini';
const basePath = process.cwd();

try {
  ensureWorkspace(stateDir, basePath);
} catch (err) {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
}
```

**Step 2: Write read-state.js**

```js
#!/usr/bin/env node
'use strict';

const { readState } = require('../src/lib/state');

const stateFile = process.argv[2];
if (!stateFile) {
  process.stderr.write('Usage: read-state.js <relative-path>\n');
  process.exit(1);
}

try {
  const content = readState(stateFile, process.cwd());
  process.stdout.write(content);
} catch (err) {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
}
```

**Step 3: Write write-state.js**

```js
#!/usr/bin/env node
'use strict';

const { writeState } = require('../src/lib/state');
const { readJson } = require('../src/lib/stdin');

const stateFile = process.argv[2];
if (!stateFile) {
  process.stderr.write('Usage: write-state.js <relative-path>\n');
  process.exit(1);
}

async function main() {
  const chunks = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const content = chunks.join('');
  writeState(stateFile, content, process.cwd());
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
});
```

**Step 4: Smoke tests**

Run: `cd /tmp && node <project>/scripts/ensure-workspace.js .test-ws && ls .test-ws/state/archive && rm -rf .test-ws`
Expected: directory listing succeeds

Run: `mkdir -p /tmp/test-rs && echo "hello" > /tmp/test-rs/file.txt && cd /tmp/test-rs && node <project>/scripts/read-state.js file.txt && rm -rf /tmp/test-rs`
Expected: `hello`

**Step 5: Commit**

```bash
git add scripts/ensure-workspace.js scripts/read-state.js scripts/write-state.js
git commit -m "feat: add Node.js ensure-workspace, read-state, write-state scripts"
```

---

## Task 16: Read-Active-Session Script

**Files:**
- Create: `scripts/read-active-session.js`

**Step 1: Write the implementation**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolveSetting } = require('../src/lib/settings');
const { readState } = require('../src/lib/state');

function resolveProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return process.cwd();
  }
}

function main() {
  const projectRoot = resolveProjectRoot();
  const stateDir = resolveSetting('MAESTRO_STATE_DIR', projectRoot) || '.gemini';

  if (path.isAbsolute(stateDir)) {
    const stateFile = path.join(stateDir, 'state', 'active-session.md');
    try {
      const content = fs.readFileSync(stateFile, 'utf8');
      process.stdout.write(content);
    } catch {
      process.stdout.write('No active session\n');
    }
    return;
  }

  const origCwd = process.cwd();
  try {
    process.chdir(projectRoot);
    const content = readState(path.join(stateDir, 'state', 'active-session.md'), projectRoot);
    process.stdout.write(content);
  } catch {
    process.stdout.write('No active session\n');
  } finally {
    process.chdir(origCwd);
  }
}

main();
```

**Step 2: Smoke test**

Run: `node scripts/read-active-session.js`
Expected: `No active session` (if no active session exists)

**Step 3: Commit**

```bash
git add scripts/read-active-session.js
git commit -m "feat: add Node.js read-active-session script"
```

---

## Task 17: Parallel Dispatch Script

This is the most complex script. It replaces the 400-line bash `parallel-dispatch.sh`.

**Files:**
- Create: `scripts/parallel-dispatch.js`
- Reference: `src/lib/settings.js`, `src/lib/process.js`, `src/lib/logger.js`, `src/lib/constants.js`

**Step 1: Write the implementation**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { resolveSetting } = require('../src/lib/settings');
const { runWithTimeout } = require('../src/lib/process');
const { log } = require('../src/lib/logger');
const { DEFAULT_TIMEOUT_MINS, DEFAULT_STAGGER_DELAY, MAX_PROMPT_SIZE_BYTES } = require('../src/lib/constants');

const SCRIPT_DIR = __dirname;
const EXTENSION_DIR = path.dirname(SCRIPT_DIR);
const AGENTS_DIR = path.join(EXTENSION_DIR, 'agents');

function usage() {
  process.stderr.write(`Usage: parallel-dispatch.js <dispatch-dir>

Dispatches Gemini CLI agents in parallel from prompt files.

Setup:
  1. Create dispatch directory with prompt files:
     <dispatch-dir>/prompts/agent-a.txt
     <dispatch-dir>/prompts/agent-b.txt

  2. Run: node parallel-dispatch.js <dispatch-dir>

Results:
  <dispatch-dir>/results/agent-a.json    (structured output)
  <dispatch-dir>/results/agent-a.exit    (exit code)
  <dispatch-dir>/results/agent-a.log     (stderr/debug)
  <dispatch-dir>/results/summary.json    (batch summary)

Environment:
  MAESTRO_DEFAULT_MODEL      Override model for all agents
  MAESTRO_WRITER_MODEL       Override model for technical-writer agent only
  MAESTRO_AGENT_TIMEOUT      Timeout in minutes (default: 10)
  MAESTRO_CLEANUP_DISPATCH   Remove prompt files after dispatch (default: false)
  MAESTRO_MAX_CONCURRENT     Max agents running simultaneously (default: 0 = unlimited)
  MAESTRO_STAGGER_DELAY      Seconds between agent launches (default: 5)
  MAESTRO_GEMINI_EXTRA_ARGS  Space-separated extra Gemini CLI args
`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dispatchDir = process.argv[2];
  if (!dispatchDir) usage();

  const promptDir = path.join(dispatchDir, 'prompts');
  const resultDir = path.join(dispatchDir, 'results');

  if (!fs.existsSync(promptDir) || !fs.statSync(promptDir).isDirectory()) {
    process.stderr.write(`ERROR: No prompts directory found at ${promptDir}\n`);
    usage();
  }

  const promptFiles = fs.readdirSync(promptDir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => path.join(promptDir, f))
    .sort();

  if (promptFiles.length === 0) {
    process.stderr.write(`ERROR: No prompt files found in ${promptDir}\n`);
    process.exit(1);
  }

  fs.mkdirSync(resultDir, { recursive: true });
  const projectRoot = process.cwd();

  const defaultModel = resolveSetting('MAESTRO_DEFAULT_MODEL', projectRoot) || '';
  const writerModel = resolveSetting('MAESTRO_WRITER_MODEL', projectRoot) || '';
  const agentTimeoutRaw = resolveSetting('MAESTRO_AGENT_TIMEOUT', projectRoot) || String(DEFAULT_TIMEOUT_MINS);
  const maxConcurrentRaw = resolveSetting('MAESTRO_MAX_CONCURRENT', projectRoot) || '0';
  const staggerDelayRaw = resolveSetting('MAESTRO_STAGGER_DELAY', projectRoot) || String(DEFAULT_STAGGER_DELAY);
  const extraArgsRaw = resolveSetting('MAESTRO_GEMINI_EXTRA_ARGS', projectRoot) || '';

  const timeoutMins = parseInt(agentTimeoutRaw, 10);
  if (isNaN(timeoutMins) || timeoutMins <= 0) {
    process.stderr.write(`ERROR: MAESTRO_AGENT_TIMEOUT must be a positive integer (got: ${agentTimeoutRaw})\n`);
    process.exit(1);
  }
  if (timeoutMins > 60) {
    process.stderr.write(`WARNING: Agent timeout set to ${timeoutMins} minutes (over 1 hour)\n`);
  }
  const timeoutMs = timeoutMins * 60 * 1000;

  const maxConcurrent = parseInt(maxConcurrentRaw, 10);
  if (isNaN(maxConcurrent) || maxConcurrent < 0) {
    process.stderr.write(`ERROR: MAESTRO_MAX_CONCURRENT must be a non-negative integer (got: ${maxConcurrentRaw})\n`);
    process.exit(1);
  }

  const staggerDelay = parseInt(staggerDelayRaw, 10);
  if (isNaN(staggerDelay) || staggerDelay < 0) {
    process.stderr.write(`ERROR: MAESTRO_STAGGER_DELAY must be a non-negative integer (got: ${staggerDelayRaw})\n`);
    process.exit(1);
  }

  const extraArgs = extraArgsRaw ? extraArgsRaw.split(/\s+/).filter(Boolean) : [];
  const hasExtraArgs = extraArgs.length > 0;

  if (hasExtraArgs && extraArgs.some((a) => a === '--allowed-tools' || a.startsWith('--allowed-tools='))) {
    process.stderr.write('WARNING: --allowed-tools is deprecated in gemini-cli; prefer --policy <path> with the Policy Engine.\n');
  }

  const concurrentDisplay = maxConcurrent === 0 ? 'unlimited' : String(maxConcurrent);
  console.log('MAESTRO PARALLEL DISPATCH');
  console.log('=========================');
  console.log(`Agents: ${promptFiles.length}`);
  console.log(`Timeout: ${timeoutMins} minutes`);
  console.log(`Model: ${defaultModel || 'default'}`);
  if (writerModel) console.log(`Writer Model: ${writerModel}`);
  console.log(`Max Concurrent: ${concurrentDisplay}`);
  console.log(`Stagger Delay: ${staggerDelay}s`);
  if (hasExtraArgs) console.log(`Extra Gemini Args: ${extraArgsRaw}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log('');

  const agentNames = [];
  const agentResults = [];
  let activeCount = 0;
  let resolveSlot = null;

  function releaseSlot() {
    activeCount--;
    if (resolveSlot) {
      const fn = resolveSlot;
      resolveSlot = null;
      fn();
    }
  }

  function waitForSlot() {
    if (maxConcurrent === 0 || activeCount < maxConcurrent) {
      activeCount++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      resolveSlot = () => {
        activeCount++;
        resolve();
      };
    });
  }

  for (let i = 0; i < promptFiles.length; i++) {
    const promptFile = promptFiles[i];
    const agentName = path.basename(promptFile, '.txt').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!agentName) {
      process.stderr.write(`ERROR: Prompt file ${path.basename(promptFile)} produces empty agent name after sanitization\n`);
      process.exit(1);
    }
    agentNames.push(agentName);

    const normalizedName = agentName.replace(/_/g, '-');
    if (fs.existsSync(AGENTS_DIR) && !fs.existsSync(path.join(AGENTS_DIR, `${normalizedName}.md`))) {
      process.stderr.write(`ERROR: Agent '${agentName}' not found in ${AGENTS_DIR}/\n`);
      try {
        const available = fs.readdirSync(AGENTS_DIR)
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.replace(/\.md$/, ''))
          .join(', ');
        if (available) process.stderr.write(`  Available agents: ${available}\n`);
      } catch {}
      process.exit(1);
    }

    const promptSize = fs.statSync(promptFile).size;
    if (promptSize > MAX_PROMPT_SIZE_BYTES) {
      process.stderr.write(`ERROR: Prompt file ${agentName} exceeds 1MB size limit (${promptSize} bytes)\n`);
      process.exit(1);
    }

    const promptContent = fs.readFileSync(promptFile, 'utf8');
    if (!promptContent.trim()) {
      process.stderr.write(`ERROR: Prompt file ${agentName} is empty or whitespace-only\n`);
      process.exit(1);
    }

    await waitForSlot();

    console.log(`Dispatching: ${agentName}`);

    const resultJson = path.join(resultDir, `${agentName}.json`);
    const resultExit = path.join(resultDir, `${agentName}.exit`);
    const resultLog = path.join(resultDir, `${agentName}.log`);

    let modelFlags = [];
    if (normalizedName === 'technical-writer' && writerModel) {
      modelFlags = ['-m', writerModel];
    } else if (defaultModel) {
      modelFlags = ['-m', defaultModel];
    }

    const geminiArgs = [
      '--approval-mode=yolo',
      '--output-format', 'json',
      ...modelFlags,
      ...extraArgs,
    ];

    const stdinPayload = `PROJECT ROOT: ${projectRoot}\nAll file paths in this task are relative to this directory. When using write_file, replace, or read_file, construct absolute paths by prepending this root. When using run_shell_command, execute from this directory.\n\n${promptContent}`;

    const stdinStream = Readable.from([stdinPayload]);
    const stdoutFd = fs.openSync(resultJson, 'w');
    const stderrFd = fs.openSync(resultLog, 'w');

    const agentPromise = runWithTimeout(
      'gemini',
      geminiArgs,
      {
        stdin: stdinStream,
        stdout: stdoutFd,
        stderr: stderrFd,
        cwd: projectRoot,
        env: { ...process.env, MAESTRO_CURRENT_AGENT: agentName },
      },
      timeoutMs
    ).then((result) => {
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
      fs.writeFileSync(resultExit, String(result.exitCode));
      releaseSlot();
      return { agentName, ...result };
    });

    agentResults.push(agentPromise);

    if (staggerDelay > 0 && i < promptFiles.length - 1) {
      await sleep(staggerDelay * 1000);
    }
  }

  console.log('');
  console.log('All agents dispatched. Waiting for completion...');
  console.log('');

  const results = await Promise.all(agentResults);
  let failures = 0;

  for (const result of results) {
    if (result.exitCode === 0) {
      console.log(`  ${result.agentName}: SUCCESS (exit 0)`);
    } else if (result.timedOut) {
      console.log(`  ${result.agentName}: TIMEOUT (exceeded ${timeoutMins}m)`);
      failures++;
    } else {
      console.log(`  ${result.agentName}: FAILED (exit ${result.exitCode})`);
      failures++;
    }
  }

  const endTime = Date.now();
  const elapsed = Math.round((endTime - startTime) / 1000);
  const succeeded = results.length - failures;
  const batchStatus = failures === 0 ? 'success' : 'partial_failure';

  console.log('');
  console.log('BATCH COMPLETE');
  console.log(`  Total agents: ${results.length}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed: ${failures}`);
  console.log(`  Wall time: ${elapsed}s`);

  const agents = results.map((r) => ({
    name: r.agentName,
    exit_code: r.exitCode,
    status: r.timedOut ? 'timeout' : (r.exitCode === 0 ? 'success' : 'failed'),
  }));

  const summary = {
    batch_status: batchStatus,
    total_agents: results.length,
    succeeded,
    failed: failures,
    wall_time_seconds: elapsed,
    agents,
  };

  fs.writeFileSync(path.join(resultDir, 'summary.json'), JSON.stringify(summary) + '\n');

  console.log('');
  console.log(`Results: ${path.join(resultDir, 'summary.json')}`);

  if ((resolveSetting('MAESTRO_CLEANUP_DISPATCH', projectRoot) || 'false') === 'true') {
    if (promptDir.endsWith(path.sep + 'prompts') || promptDir.endsWith('/prompts')) {
      fs.rmSync(promptDir, { recursive: true, force: true });
      console.log('Prompt files cleaned up (MAESTRO_CLEANUP_DISPATCH=true)');
    } else {
      process.stderr.write(`WARNING: Skipped cleanup — PROMPT_DIR does not match expected pattern: ${promptDir}\n`);
    }
  }

  process.exit(failures);
}

const startTime = Date.now();
main().catch((err) => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});
```

**Important:** The `stdout` and `stderr` parameters passed to `runWithTimeout` need to be file descriptors (numbers) that can be used with `child_process.spawn`'s `stdio` option. Adjust `process.js` if needed to handle fd numbers by wrapping them: `typeof stdout === 'number' ? stdout : 'ignore'`.

**Step 2: Smoke test (requires stub gemini)**

The parallel dispatch tests use a stub gemini binary. Defer to integration test migration in Task 18.

**Step 3: Commit**

```bash
git add scripts/parallel-dispatch.js
git commit -m "feat: add Node.js parallel-dispatch script"
```

---

## Task 18: Test Migration

Update all 8 test files to invoke `node` instead of `bash`.

**Files to modify:**
- `tests/test-before-agent-hook.sh`: change `bash "$HOOK"` to `node "$HOOK_JS"` where `HOOK_JS` points to `hooks/before-agent.js`
- `tests/test-after-agent-hook.sh`: change `bash "$HOOK"` to `node "$HOOK_JS"`
- `tests/test-session-start-hook.sh`: change `bash "$HOOK"` to `node "$HOOK_JS"`
- `tests/test-session-end-hook.sh`: change `bash "$SESSION_END_HOOK"` to `node "$HOOK_JS"`
- `tests/test-parallel-dispatch-args.sh`: change `"$DISPATCH_SCRIPT" "$DISPATCH_DIR"` to `node "$DISPATCH_SCRIPT" "$DISPATCH_DIR"`
- `tests/test-parallel-dispatch-config-fallback.sh`: same pattern
- `tests/test-parallel-dispatch-exit-code-propagation.sh`: same pattern
- `tests/test-read-active-session-script.sh`: change `bash "$SCRIPT"` to `node "$SCRIPT_JS"`

**Pattern for each test file:**

1. Change the hook/script path variable from `.sh` to `.js`:
   - `HOOK="$PROJECT_ROOT/hooks/before-agent.sh"` → `HOOK="$PROJECT_ROOT/hooks/before-agent.js"`
2. Change invocation from `bash "$HOOK"` to `node "$HOOK"`:
   - `echo "$INPUT" | bash "$HOOK" 2>/dev/null` → `echo "$INPUT" | node "$HOOK" 2>/dev/null`
   - `MAESTRO_CURRENT_AGENT="coder" bash "$HOOK" <<< "$INPUT"` → `MAESTRO_CURRENT_AGENT="coder" node "$HOOK" <<< "$INPUT"`
3. For dispatch tests:
   - `"$DISPATCH_SCRIPT" "$DISPATCH_DIR"` → `node "$DISPATCH_SCRIPT" "$DISPATCH_DIR"`
4. For read-active-session:
   - `bash "$SCRIPT"` → `node "$SCRIPT"`

**Step 1: Update all test files**

Apply the substitution pattern above to each test file. This is mechanical — find/replace `bash "$HOOK"` → `node "$HOOK"` and update path variables.

**Step 2: Run all tests**

Run: `bash tests/run-all.sh`
Expected: All 8 test suites pass. If any fail, debug and fix the corresponding Node.js entry point or lib module.

**Step 3: Also run unit tests**

Run: `node --test tests/unit/`
Expected: All unit tests pass.

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: migrate all integration tests from bash to node invocations"
```

---

## Task 19: Delete Old Shell Scripts

**Files to delete:**
- `hooks/before-agent.sh`
- `hooks/after-agent.sh`
- `hooks/session-start.sh`
- `hooks/session-end.sh`
- `hooks/lib/common.sh`
- `hooks/lib/` (directory)
- `scripts/parallel-dispatch.sh`
- `scripts/ensure-workspace.sh`
- `scripts/read-state.sh`
- `scripts/write-state.sh`
- `scripts/read-active-session.sh`

**Keep:**
- `scripts/test-parallel-dispatch.sh` — this is a manual proof-of-concept test that calls the dispatch script. Update it to call `node scripts/parallel-dispatch.js` instead of the bash version.

**Step 1: Delete old files**

```bash
git rm hooks/before-agent.sh hooks/after-agent.sh hooks/session-start.sh hooks/session-end.sh
git rm hooks/lib/common.sh
git rm scripts/parallel-dispatch.sh scripts/ensure-workspace.sh scripts/read-state.sh scripts/write-state.sh scripts/read-active-session.sh
```

**Step 2: Update test-parallel-dispatch.sh**

Change `"$SCRIPT_DIR/parallel-dispatch.sh"` to `node "$SCRIPT_DIR/parallel-dispatch.js"`.

**Step 3: Run all tests again to confirm nothing broke**

Run: `bash tests/run-all.sh && node --test tests/unit/`
Expected: All pass

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old bash hooks and scripts"
```

---

## Task 20: Documentation Updates

**Files to modify:**
- `CLAUDE.md`: update source-of-truth files, hook contract, parallel dispatch contract, testing section
- `GEMINI.md`: update script references from `.sh` to `.js`, update hook table

**Step 1: Update CLAUDE.md**

Changes:
- Source-of-Truth Files: replace `.sh` paths with `.js` paths, add `src/lib/*.js`
- Hook Contract: change `hooks/before-agent.sh` → `hooks/before-agent.js`, etc.
- Parallel Dispatch Contract: change `scripts/parallel-dispatch.sh` → `scripts/parallel-dispatch.js`, update invocation to `node`
- Testing section: add `node --test tests/unit/` for unit tests

**Step 2: Update GEMINI.md**

Changes:
- Line 30: `./scripts/ensure-workspace.sh` → `node ./scripts/ensure-workspace.js`
- Line 112: `scripts/parallel-dispatch.sh` → `scripts/parallel-dispatch.js`
- Line 117: `./scripts/parallel-dispatch.sh` → `node ./scripts/parallel-dispatch.js`
- Line 169: `scripts/read-active-session.sh` → `node scripts/read-active-session.js`
- Lines 206-207: `hooks/before-agent.sh` → `hooks/before-agent.js`, `hooks/after-agent.sh` → `hooks/after-agent.js`

**Step 3: Verify docs render correctly**

Eyeball the markdown for broken formatting.

**Step 4: Commit**

```bash
git add CLAUDE.md GEMINI.md
git commit -m "docs: update references from bash to Node.js scripts"
```

---

## Task 21: Version Bump

**Files to modify:**
- `gemini-extension.json`: bump version from `1.2.0` to `1.3.0`

**Step 1: Bump version**

Run: `npm version minor --no-git-tag-version` (if package.json exists) or manually edit `gemini-extension.json`.

**Step 2: Verify**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('gemini-extension.json','utf8')).version)"`
Expected: `1.3.0`

**Step 3: Final validation**

Run: `bash tests/run-all.sh && node --test tests/unit/`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add gemini-extension.json
git commit -m "chore: bump version to 1.3.0 for cross-platform Node.js rewrite"
```
