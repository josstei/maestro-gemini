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

function normalizeAgentName(name) {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/-/g, '_');
}

const AGENT_PATTERNS = KNOWN_AGENTS.map((agent) => {
  const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const aliasPattern = escaped.replace(/_/g, '[-_]');
  return {
    agent,
    patterns: [
      new RegExp(`(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?${aliasPattern}\\b`),
      new RegExp(`@${aliasPattern}\\b`),
    ],
  };
});

function detectAgentFromPrompt(prompt) {
  const envAgent = normalizeAgentName(process.env.MAESTRO_CURRENT_AGENT);
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

module.exports = { KNOWN_AGENTS, detectAgentFromPrompt };
