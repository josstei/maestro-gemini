'use strict';

const { KNOWN_AGENTS } = require('./constants');

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const AGENT_PATTERNS = KNOWN_AGENTS.map((agent) => {
  const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    agent,
    patterns: [
      new RegExp(`(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?${escaped}\\b`),
      new RegExp(`@${escaped}\\b`),
    ],
  };
});

function validateSessionId(id) {
  if (id == null || typeof id !== 'string') return false;
  return SESSION_ID_PATTERN.test(id);
}

function detectAgentFromPrompt(prompt) {
  const envAgent = process.env.MAESTRO_CURRENT_AGENT;
  if (envAgent && KNOWN_AGENTS.includes(envAgent)) return envAgent;

  if (!prompt) return '';

  const lower = prompt.toLowerCase();
  for (const { agent, patterns } of AGENT_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      return agent;
    }
  }

  return '';
}

module.exports = { validateSessionId, detectAgentFromPrompt };
