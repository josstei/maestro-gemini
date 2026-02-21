'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { atomicWriteSync } = require('../../src/lib/core/atomic-write');

describe('atomicWriteSync()', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-file-utils-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes content to a file and reads it back', () => {
    const filePath = path.join(tmpDir, 'output.txt');
    atomicWriteSync(filePath, 'hello world');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'hello world');
  });

  it('creates parent directories and writes to a nested path', () => {
    const filePath = path.join(tmpDir, 'deep', 'nested', 'dir', 'output.txt');
    atomicWriteSync(filePath, 'nested content');
    assert.ok(fs.existsSync(path.join(tmpDir, 'deep', 'nested', 'dir')));
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'nested content');
  });

  it('cleans up the tmp file and rethrows when writeFileSync fails', () => {
    if (process.platform === 'win32') return;

    const readOnlyDir = path.join(tmpDir, 'locked');
    fs.mkdirSync(readOnlyDir, { recursive: true });
    fs.chmodSync(readOnlyDir, 0o555);

    const filePath = path.join(readOnlyDir, 'output.txt');
    const expectedTmpFile = filePath + `.tmp.${process.pid}`;

    try {
      assert.throws(() => atomicWriteSync(filePath, 'data'));
      assert.equal(fs.existsSync(expectedTmpFile), false);
    } finally {
      fs.chmodSync(readOnlyDir, 0o755);
    }
  });
});
