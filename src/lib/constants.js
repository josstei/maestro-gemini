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
