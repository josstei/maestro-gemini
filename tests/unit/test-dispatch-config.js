'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const { isStrictInteger, parsePositiveInteger, parseNonNegativeInteger, resolveDispatchConfig } = require('../../src/lib/dispatch-config');

describe('dispatch-config', () => {
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

  describe('resolveDispatchConfig()', () => {
    const savedEnv = {};
    const envVars = [
      'MAESTRO_DEFAULT_MODEL', 'MAESTRO_WRITER_MODEL', 'MAESTRO_AGENT_TIMEOUT',
      'MAESTRO_MAX_CONCURRENT', 'MAESTRO_STAGGER_DELAY', 'MAESTRO_GEMINI_EXTRA_ARGS',
    ];

    beforeEach(() => {
      for (const key of envVars) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const key of envVars) {
        if (savedEnv[key] !== undefined) {
          process.env[key] = savedEnv[key];
        } else {
          delete process.env[key];
        }
      }
    });

    it('returns complete config with defaults', () => {
      const config = resolveDispatchConfig('/tmp/nonexistent-project');
      assert.equal(config.defaultModel, '');
      assert.equal(config.writerModel, '');
      assert.equal(config.timeoutMins, 10);
      assert.equal(config.timeoutMs, 600000);
      assert.equal(config.maxConcurrent, 0);
      assert.equal(config.staggerDelay, 5);
      assert.deepEqual(config.extraArgs, []);
      assert.equal(config.extraArgsRaw, '');
    });

    it('reads from env vars', () => {
      process.env.MAESTRO_DEFAULT_MODEL = 'gemini-2.0-flash';
      process.env.MAESTRO_WRITER_MODEL = 'gemini-2.0-pro';
      process.env.MAESTRO_AGENT_TIMEOUT = '20';
      process.env.MAESTRO_MAX_CONCURRENT = '3';
      process.env.MAESTRO_STAGGER_DELAY = '2';
      process.env.MAESTRO_GEMINI_EXTRA_ARGS = '--sandbox none --verbose';

      const config = resolveDispatchConfig('/tmp/nonexistent-project');
      assert.equal(config.defaultModel, 'gemini-2.0-flash');
      assert.equal(config.writerModel, 'gemini-2.0-pro');
      assert.equal(config.timeoutMins, 20);
      assert.equal(config.timeoutMs, 1200000);
      assert.equal(config.maxConcurrent, 3);
      assert.equal(config.staggerDelay, 2);
      assert.deepEqual(config.extraArgs, ['--sandbox', 'none', '--verbose']);
      assert.equal(config.extraArgsRaw, '--sandbox none --verbose');
    });
  });
});
