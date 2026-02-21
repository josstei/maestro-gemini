#!/usr/bin/env node
'use strict';

const { defineHook } = require('../../src/lib/hooks/hook-facade');

const mode = process.argv[2];

if (mode === 'success') {
  defineHook({
    handler(ctx) {
      return JSON.stringify({ result: 'ok', sid: ctx.sessionId });
    },
    fallbackResponse() {
      return JSON.stringify({ fallback: true });
    },
  });
} else if (mode === 'error') {
  defineHook({
    handler() {
      throw new Error('deliberate test error');
    },
    fallbackResponse() {
      return JSON.stringify({ fallback: true });
    },
  });
}
