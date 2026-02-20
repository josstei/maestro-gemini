#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { advisory } = require('../src/lib/response');
const { validateSessionId } = require('../src/lib/validation');
const hookState = require('../src/lib/hook-state');
const { hasActiveSession } = require('../src/lib/state');
const { runHook } = require('../src/lib/hook-runner');

function handler(input) {
  const sessionId = input.session_id || '';
  const cwd = input.cwd || '';

  hookState.pruneStale();

  if (!hasActiveSession(cwd)) {
    return advisory();
  }

  if (validateSessionId(sessionId)) {
    const baseDir = hookState.getBaseDir();
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true });
  }

  return advisory();
}

runHook(handler, advisory);

module.exports = { handler };
