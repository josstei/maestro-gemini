#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { advisory } = require('../src/lib/response');
const { validateSessionId } = require('../src/lib/validation');
const hookState = require('../src/lib/hook-state');
const { runHook } = require('../src/lib/hook-runner');

function handler(input) {
  const sessionId = input.session_id || '';

  if (!validateSessionId(sessionId)) {
    return advisory();
  }

  const sessionDir = path.join(hookState.getBaseDir(), sessionId);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {}

  return advisory();
}

runHook(handler, advisory);

module.exports = { handler };
