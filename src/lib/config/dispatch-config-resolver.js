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
