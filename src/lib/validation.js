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
