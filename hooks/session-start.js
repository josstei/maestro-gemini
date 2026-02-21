#!/usr/bin/env node
'use strict';

const { defineHook, response, hookState, state } = require('../src/lib/hooks/hook-facade');

function handler(ctx) {
  hookState.pruneStale();

  if (!state.hasActiveSession(ctx.cwd)) {
    return response.advisory();
  }

  hookState.ensureSessionDir(ctx.sessionId);
  return response.advisory();
}

defineHook({ handler, fallbackResponse: response.advisory });

module.exports = { handler };
