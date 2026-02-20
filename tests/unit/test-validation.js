'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../../src/lib/validation');

describe('validateSessionId()', () => {
  it('accepts alphanumeric with hyphens and underscores', () => {
    assert.equal(validation.validateSessionId('test-session_123'), true);
  });

  it('rejects path traversal', () => {
    assert.equal(validation.validateSessionId('../../../etc'), false);
  });

  it('rejects empty string', () => {
    assert.equal(validation.validateSessionId(''), false);
  });

  it('rejects spaces', () => {
    assert.equal(validation.validateSessionId('has space'), false);
  });

  it('rejects null/undefined', () => {
    assert.equal(validation.validateSessionId(null), false);
    assert.equal(validation.validateSessionId(undefined), false);
  });
});

describe('detectAgentFromPrompt()', () => {
  it('returns agent for "delegate to tester" pattern', () => {
    assert.equal(validation.detectAgentFromPrompt('delegate to tester to run tests'), 'tester');
  });

  it('returns agent for "dispatch coder" pattern', () => {
    assert.equal(validation.detectAgentFromPrompt('dispatch coder for implementation'), 'coder');
  });

  it('returns agent for "@architect" pattern', () => {
    assert.equal(validation.detectAgentFromPrompt('Handing off to @architect'), 'architect');
  });

  it('returns agent for "hand off to the security_engineer" pattern', () => {
    assert.equal(
      validation.detectAgentFromPrompt('hand off to the security_engineer for review'),
      'security_engineer'
    );
  });

  it('returns empty string for no delegation pattern', () => {
    assert.equal(
      validation.detectAgentFromPrompt('You are the tester agent. Run the test suite.'),
      ''
    );
  });

  it('returns empty string for empty prompt', () => {
    assert.equal(validation.detectAgentFromPrompt(''), '');
  });

  it('is case-insensitive', () => {
    assert.equal(validation.detectAgentFromPrompt('DELEGATE TO CODER now'), 'coder');
  });

  it('prefers MAESTRO_CURRENT_AGENT env when set to a known agent', () => {
    const orig = process.env.MAESTRO_CURRENT_AGENT;
    process.env.MAESTRO_CURRENT_AGENT = 'debugger';
    try {
      assert.equal(validation.detectAgentFromPrompt('delegate to coder'), 'debugger');
    } finally {
      if (orig === undefined) delete process.env.MAESTRO_CURRENT_AGENT;
      else process.env.MAESTRO_CURRENT_AGENT = orig;
    }
  });

  it('ignores MAESTRO_CURRENT_AGENT when set to unknown agent', () => {
    const orig = process.env.MAESTRO_CURRENT_AGENT;
    process.env.MAESTRO_CURRENT_AGENT = 'unknown_agent';
    try {
      assert.equal(validation.detectAgentFromPrompt('delegate to coder'), 'coder');
    } finally {
      if (orig === undefined) delete process.env.MAESTRO_CURRENT_AGENT;
      else process.env.MAESTRO_CURRENT_AGENT = orig;
    }
  });
});
