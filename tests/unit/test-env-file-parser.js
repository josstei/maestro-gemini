'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseEnvFile } = require('../../src/lib/core/env-file-parser');

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
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result.BAZ, 'qux');
  });

  it('strips double quotes', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO="hello world"\n');
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'hello world');
  });

  it('strips single quotes', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, "FOO='hello world'\n");
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'hello world');
  });

  it('ignores comments and blank lines', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, '# comment\n\nFOO=bar\n');
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(Object.keys(result).length, 1);
  });

  it('returns empty object for missing file', () => {
    const result = parseEnvFile(path.join(tmpDir, 'nonexistent'));
    assert.deepEqual(result, {});
  });

  it('last value wins for duplicate keys', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO=first\nFOO=second\n');
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'second');
  });

  it('strips export prefix from keys', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'export FOO=bar\nexport BAZ="qux"\n');
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result.BAZ, 'qux');
  });

  it('handles export with no space before equals', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'export FOO=bar\n');
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result['export FOO'], undefined);
  });

  it('strips inline comments', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO=bar # this is a comment\nBAZ="hello" # another\n');
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'bar');
    assert.equal(result.BAZ, 'hello');
  });

  it('preserves hash characters inside quoted values', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'FOO="alpha # beta"\nBAR=\'gamma # delta\'\n');
    const result = parseEnvFile(envFile);
    assert.equal(result.FOO, 'alpha # beta');
    assert.equal(result.BAR, 'gamma # delta');
  });

  it('skips lines with empty keys', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, '=nokey\nFOO=bar\n');
    const result = parseEnvFile(envFile);
    assert.equal(result[''], undefined);
    assert.equal(result.FOO, 'bar');
  });
});
