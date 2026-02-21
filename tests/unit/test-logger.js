'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const logger = require('../../src/lib/core/logger');

describe('logger', () => {
  it('exports a log function', () => {
    assert.equal(typeof logger.log, 'function');
  });

  it('writes formatted message to stderr', () => {
    const original = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += chunk; return true; };
    try {
      logger.log('INFO', 'test message');
      assert.equal(captured, '[INFO] maestro: test message\n');
    } finally {
      process.stderr.write = original;
    }
  });

  it('handles WARN level', () => {
    const original = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += chunk; return true; };
    try {
      logger.log('WARN', 'something wrong');
      assert.equal(captured, '[WARN] maestro: something wrong\n');
    } finally {
      process.stderr.write = original;
    }
  });
});

describe('fatal()', () => {
  it('writes error to stderr and exits with code 1', () => {
    const { execFileSync } = require('child_process');
    const loggerPath = path.resolve(__dirname, '..', '..', 'src', 'lib', 'core', 'logger.js');
    const script = `const { fatal } = require('${loggerPath.replace(/\\/g, '\\\\')}'); fatal('something broke');`;
    try {
      execFileSync('node', ['-e', script], { encoding: 'utf8', timeout: 5000 });
      assert.fail('Expected process to exit with code 1');
    } catch (err) {
      assert.equal(err.status, 1);
      assert.ok(err.stderr.includes('ERROR: something broke'));
    }
  });
});
