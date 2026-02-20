'use strict';

const { resolveSetting } = require('./settings');
const { fatal } = require('./logger');
const { DEFAULT_TIMEOUT_MINS, DEFAULT_STAGGER_DELAY_SECS } = require('./constants');

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

module.exports = {
  isStrictInteger,
  parsePositiveInteger,
  parseNonNegativeInteger,
  resolveDispatchConfig,
};
