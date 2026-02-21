'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

describe('stdin-reader', () => {
  describe('readJson()', () => {
    const READJSON_HARNESS = path.resolve(__dirname, '..', '..', 'src', 'lib', 'core', 'stdin-reader.js');

    function runReadJsonProcess(stdinContent) {
      const script = `
        const { readJson } = require('${READJSON_HARNESS.replace(/\\/g, '\\\\')}');
        readJson().then((result) => {
          process.stdout.write(JSON.stringify(result));
        });
      `;
      return execFileSync('node', ['-e', script], {
        input: stdinContent,
        encoding: 'utf8',
        timeout: 5000,
      });
    }

    it('parses valid JSON from stdin', () => {
      const result = JSON.parse(runReadJsonProcess('{"foo":"bar"}'));
      assert.deepEqual(result, { foo: 'bar' });
    });

    it('returns empty object for empty stdin', () => {
      const result = JSON.parse(runReadJsonProcess(''));
      assert.deepEqual(result, {});
    });

    it('returns empty object for whitespace-only stdin', () => {
      const result = JSON.parse(runReadJsonProcess('   \n  '));
      assert.deepEqual(result, {});
    });

    it('returns empty object for malformed JSON', () => {
      const result = JSON.parse(runReadJsonProcess('{not valid json'));
      assert.deepEqual(result, {});
    });
  });

  describe('readText()', () => {
    const STDIN_HARNESS = path.resolve(__dirname, '..', '..', 'src', 'lib', 'core', 'stdin-reader.js');

    function runReadTextProcess(stdinContent) {
      const script = `
        const { readText } = require('${STDIN_HARNESS.replace(/\\/g, '\\\\')}');
        readText().then((result) => {
          process.stdout.write(result);
        });
      `;
      return execFileSync('node', ['-e', script], {
        input: stdinContent,
        encoding: 'utf8',
        timeout: 5000,
      });
    }

    it('returns raw text from stdin', () => {
      const result = runReadTextProcess('hello world');
      assert.equal(result, 'hello world');
    });

    it('returns empty string for empty stdin', () => {
      const result = runReadTextProcess('');
      assert.equal(result, '');
    });

    it('preserves whitespace', () => {
      const result = runReadTextProcess('  line1\n  line2\n');
      assert.equal(result, '  line1\n  line2\n');
    });
  });
});
