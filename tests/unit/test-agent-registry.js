'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { KNOWN_AGENTS, detectAgentFromPrompt } = require('../../src/lib/core/agent-registry');

describe('KNOWN_AGENTS', () => {
  it('is a frozen array of 12 agents', () => {
    assert.ok(Array.isArray(KNOWN_AGENTS));
    assert.equal(KNOWN_AGENTS.length, 12);
    assert.ok(Object.isFrozen(KNOWN_AGENTS));
    assert.ok(KNOWN_AGENTS.includes('coder'));
    assert.ok(KNOWN_AGENTS.includes('architect'));
    assert.ok(KNOWN_AGENTS.includes('tester'));
  });
});

describe('detectAgentFromPrompt()', () => {
  it('returns agent for "delegate to tester" pattern', () => {
    assert.equal(detectAgentFromPrompt('delegate to tester to run tests'), 'tester');
  });

  it('returns agent for "dispatch coder" pattern', () => {
    assert.equal(detectAgentFromPrompt('dispatch coder for implementation'), 'coder');
  });

  it('returns agent for "@architect" pattern', () => {
    assert.equal(detectAgentFromPrompt('Handing off to @architect'), 'architect');
  });

  it('returns agent for "hand off to the security_engineer" pattern', () => {
    assert.equal(
      detectAgentFromPrompt('hand off to the security_engineer for review'),
      'security_engineer'
    );
  });

  it('accepts hyphenated agent aliases in delegation patterns', () => {
    assert.equal(
      detectAgentFromPrompt('hand off to the security-engineer for review'),
      'security_engineer'
    );
    assert.equal(
      detectAgentFromPrompt('delegate to technical-writer for docs'),
      'technical_writer'
    );
  });

  it('accepts hyphenated agent aliases in @mentions', () => {
    assert.equal(detectAgentFromPrompt('Please ask @code-reviewer to audit this'), 'code_reviewer');
  });

  it('returns empty string for no delegation pattern', () => {
    assert.equal(
      detectAgentFromPrompt('You are the tester agent. Run the test suite.'),
      ''
    );
  });

  it('returns empty string for empty prompt', () => {
    assert.equal(detectAgentFromPrompt(''), '');
  });

  it('is case-insensitive', () => {
    assert.equal(detectAgentFromPrompt('DELEGATE TO CODER now'), 'coder');
  });

  it('prefers MAESTRO_CURRENT_AGENT env when set to a known agent', () => {
    const orig = process.env.MAESTRO_CURRENT_AGENT;
    process.env.MAESTRO_CURRENT_AGENT = 'debugger';
    try {
      assert.equal(detectAgentFromPrompt('delegate to coder'), 'debugger');
    } finally {
      if (orig === undefined) delete process.env.MAESTRO_CURRENT_AGENT;
      else process.env.MAESTRO_CURRENT_AGENT = orig;
    }
  });

  it('ignores MAESTRO_CURRENT_AGENT when set to unknown agent', () => {
    const orig = process.env.MAESTRO_CURRENT_AGENT;
    process.env.MAESTRO_CURRENT_AGENT = 'unknown_agent';
    try {
      assert.equal(detectAgentFromPrompt('delegate to coder'), 'coder');
    } finally {
      if (orig === undefined) delete process.env.MAESTRO_CURRENT_AGENT;
      else process.env.MAESTRO_CURRENT_AGENT = orig;
    }
  });

  it('normalizes hyphenated MAESTRO_CURRENT_AGENT to canonical name', () => {
    const orig = process.env.MAESTRO_CURRENT_AGENT;
    process.env.MAESTRO_CURRENT_AGENT = 'code-reviewer';
    try {
      assert.equal(detectAgentFromPrompt('delegate to coder'), 'code_reviewer');
    } finally {
      if (orig === undefined) delete process.env.MAESTRO_CURRENT_AGENT;
      else process.env.MAESTRO_CURRENT_AGENT = orig;
    }
  });
});
