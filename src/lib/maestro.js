'use strict';

const { readJson, getBool } = require('./stdin');
const { log } = require('./logger');
const response = require('./response');
const validation = require('./validation');
const hookState = require('./hook-state');
const state = require('./state');

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

module.exports = {
  defineHook,
  buildHookContext,
  response,
  validation,
  hookState,
  state,
  log,
};
