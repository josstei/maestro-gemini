'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateSessionId } = require('../../src/lib/state/session-id-validator');

describe('validateSessionId()', () => {
  it('accepts alphanumeric with hyphens and underscores', () => {
    assert.equal(validateSessionId('test-session_123'), true);
  });

  it('rejects path traversal', () => {
    assert.equal(validateSessionId('../../../etc'), false);
  });

  it('rejects empty string', () => {
    assert.equal(validateSessionId(''), false);
  });

  it('rejects spaces', () => {
    assert.equal(validateSessionId('has space'), false);
  });

  it('rejects null/undefined', () => {
    assert.equal(validateSessionId(null), false);
    assert.equal(validateSessionId(undefined), false);
  });
});
