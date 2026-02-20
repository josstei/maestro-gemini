'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const settings = require('../../src/lib/settings');

describe('parseEnvFile()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-settings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses simple key=value', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO=bar\nBAZ=qux\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result.BAZ, 'qux');
  });

  it('strips double quotes', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO="hello world"\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'hello world');
  });

  it('strips single quotes', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, "FOO='hello world'\n");
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'hello world');
  });

  it('ignores comments and blank lines', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, '# comment\n\nFOO=bar\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(Object.keys(result).length, 1);
  });

  it('returns empty object for missing file', () => {
    const result = settings.parseEnvFile(path.join(tmpDir, 'nonexistent'));
    assert.deepEqual(result, {});
  });

  it('last value wins for duplicate keys', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO=first\nFOO=second\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'second');
  });

  it('strips export prefix from keys', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'export FOO=bar\nexport BAZ="qux"\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result.BAZ, 'qux');
  });

  it('handles export with no space before equals', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'export FOO=bar\n');
    const result = settings.parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result['export FOO'], undefined);
  });
});

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
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-env');
  });

  it('falls back to project .env', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_MAESTRO_VAR=from-project\n');
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-project');
  });

  it('returns undefined when not found anywhere', () => {
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, undefined);
  });

  it('empty .env value falls through to next tier', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_MAESTRO_VAR=\n');
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, undefined);
  });

  it('empty env var falls through to project .env', () => {
    process.env.TEST_MAESTRO_VAR = '';
    fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_MAESTRO_VAR=from-project\n');
    const result = settings.resolveSetting('TEST_MAESTRO_VAR', tmpDir);
    assert.equal(result, 'from-project');
  });
});
