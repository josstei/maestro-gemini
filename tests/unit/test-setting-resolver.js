'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveSetting } = require('../../src/lib/config/setting-resolver');

describe('resolveSetting()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-resolve-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TEST_MAESTRO_VAR;
  });

  it('prefers env var when set', () => {
    process.env.TEST_MAESTRO_VAR = 'from-env';
    const result = resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-env');
  });

  it('falls back to project .env', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_MAESTRO_VAR=from-project\n');
    const result = resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-project');
  });

  it('returns undefined when not found anywhere', () => {
    const result = resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, undefined);
  });

  it('empty .env value falls through to next tier', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_MAESTRO_VAR=\n');
    const result = resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, undefined);
  });

  it('empty env var falls through to project .env', () => {
    process.env.TEST_MAESTRO_VAR = '';
    fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_MAESTRO_VAR=from-project\n');
    const result = resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-project');
  });
});
