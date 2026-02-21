'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const { isStrictInteger, parsePositiveInteger, parseNonNegativeInteger } = require('../../src/lib/core/integer-parser');

describe('integer-parser', () => {
  describe('isStrictInteger()', () => {
    it('accepts valid integers', () => {
      assert.equal(isStrictInteger('0'), true);
      assert.equal(isStrictInteger('5'), true);
      assert.equal(isStrictInteger('100'), true);
    });

    it('rejects non-integers', () => {
      assert.equal(isStrictInteger(''), false);
      assert.equal(isStrictInteger('abc'), false);
      assert.equal(isStrictInteger('-1'), false);
      assert.equal(isStrictInteger('1.5'), false);
      assert.equal(isStrictInteger(null), false);
      assert.equal(isStrictInteger(5), false);
    });
  });

  describe('parsePositiveInteger()', () => {
    it('returns valid positive values', () => {
      assert.equal(parsePositiveInteger('TEST_VAR', '5'), 5);
      assert.equal(parsePositiveInteger('TEST_VAR', '100'), 100);
    });

    it('exits for invalid input', () => {
      const helperScript = path.join(__dirname, '..', 'helpers', 'parse-int-helper.js');
      try {
        execFileSync('node', [helperScript, 'positive', 'TEST_VAR', 'abc'], {
          encoding: 'utf8',
          timeout: 5000,
        });
        assert.fail('Should have exited');
      } catch (err) {
        assert.equal(err.status, 1);
        assert.ok(err.stderr.includes('TEST_VAR must be a positive integer'));
      }
    });

    it('exits for zero', () => {
      const helperScript = path.join(__dirname, '..', 'helpers', 'parse-int-helper.js');
      try {
        execFileSync('node', [helperScript, 'positive', 'TEST_VAR', '0'], {
          encoding: 'utf8',
          timeout: 5000,
        });
        assert.fail('Should have exited');
      } catch (err) {
        assert.equal(err.status, 1);
        assert.ok(err.stderr.includes('TEST_VAR must be a positive integer'));
      }
    });
  });

  describe('parseNonNegativeInteger()', () => {
    it('returns valid values including zero', () => {
      assert.equal(parseNonNegativeInteger('TEST_VAR', '0'), 0);
      assert.equal(parseNonNegativeInteger('TEST_VAR', '10'), 10);
    });

    it('exits for invalid input', () => {
      const helperScript = path.join(__dirname, '..', 'helpers', 'parse-int-helper.js');
      try {
        execFileSync('node', [helperScript, 'nonneg', 'TEST_VAR', '-1'], {
          encoding: 'utf8',
          timeout: 5000,
        });
        assert.fail('Should have exited');
      } catch (err) {
        assert.equal(err.status, 1);
        assert.ok(err.stderr.includes('TEST_VAR must be a non-negative integer'));
      }
    });
  });
});
