'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');
const processHelper = require('../../src/lib/dispatch/process-runner');

describe('runWithTimeout()', () => {
  it('runs a simple command and returns exit code 0', async () => {
    const result = await processHelper.runWithTimeout('node', ['-e', 'process.exit(0)'], {}, 5000);
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
  });

  it('captures non-zero exit code', async () => {
    const result = await processHelper.runWithTimeout('node', ['-e', 'process.exit(42)'], {}, 5000);
    assert.equal(result.exitCode, 42);
    assert.equal(result.timedOut, false);
  });

  it('times out long-running process', async () => {
    const result = await processHelper.runWithTimeout(
      'node', ['-e', 'setTimeout(() => {}, 30000)'], {}, 500
    );
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
  });

  it('pipes stdin content to child process', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-process-'));
    const outputFile = path.join(tmpDir, 'stdin-capture.txt');

    try {
      const stdinPayload = 'Hello from stdin pipe test';
      const stdinStream = Readable.from([stdinPayload]);

      const script = `
        const fs = require('fs');
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (c) => { data += c; });
        process.stdin.on('end', () => {
          fs.writeFileSync('${outputFile.replace(/\\/g, '\\\\')}', data);
          process.exit(0);
        });
      `;

      const result = await processHelper.runWithTimeout(
        'node', ['-e', script],
        { stdin: stdinStream },
        5000
      );

      assert.equal(result.exitCode, 0);
      assert.equal(result.timedOut, false);

      const captured = fs.readFileSync(outputFile, 'utf8');
      assert.equal(captured, stdinPayload);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws TypeError for invalid timeoutMs', () => {
    assert.throws(
      () => processHelper.runWithTimeout('node', ['-e', ''], {}, undefined),
      { name: 'TypeError' }
    );
    assert.throws(
      () => processHelper.runWithTimeout('node', ['-e', ''], {}, NaN),
      { name: 'TypeError' }
    );
    assert.throws(
      () => processHelper.runWithTimeout('node', ['-e', ''], {}, -1),
      { name: 'TypeError' }
    );
    assert.throws(
      () => processHelper.runWithTimeout('node', ['-e', ''], {}, 0),
      { name: 'TypeError' }
    );
  });
});
