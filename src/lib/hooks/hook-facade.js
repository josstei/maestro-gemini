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
