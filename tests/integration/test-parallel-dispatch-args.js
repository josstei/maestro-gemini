'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  scriptPath,
  runScriptWithExit,
  createTempDir,
  createGeminiStub,
  removeTempDir,
} = require('./helpers');

const DISPATCH_SCRIPT = scriptPath('parallel-dispatch.js');

const GEMINI_STUB = `#!/usr/bin/env node
'use strict';
const fs = require('fs');

const argvFile = process.env.MAESTRO_TEST_ARGV_CAPTURE;
const stdinFile = process.env.MAESTRO_TEST_STDIN_CAPTURE;

fs.writeFileSync(argvFile, JSON.stringify(process.argv.slice(2)));

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(stdinFile, data);
  process.stdout.write('{"status":"ok"}\\n');
});
`;

describe('parallel-dispatch argument forwarding', () => {
  let tempDir;
  let dispatchDir;
  let binDir;
  let argvCaptureFile;
  let stdinCaptureFile;

  before(() => {
    tempDir = createTempDir('maestro-test-dispatch-args-');
    dispatchDir = path.join(tempDir, '.maestro-parallel');
    binDir = path.join(tempDir, 'bin');
    argvCaptureFile = path.join(tempDir, 'gemini-argv.json');
    stdinCaptureFile = path.join(tempDir, 'gemini-stdin.txt');

    fs.mkdirSync(path.join(dispatchDir, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(dispatchDir, 'prompts', 'architect.txt'),
      'Review the project architecture and produce a concise summary.'
    );

    createGeminiStub(binDir, GEMINI_STUB);
  });

  after(() => {
    removeTempDir(tempDir);
  });

  it('forwards all expected args and streams prompt payload over stdin', () => {
    const existingPath = process.env.PATH || '';
    const { stdout, exitCode } = runScriptWithExit(
      DISPATCH_SCRIPT,
      [dispatchDir],
      {
        env: {
          PATH: `${binDir}:${existingPath}`,
          MAESTRO_TEST_ARGV_CAPTURE: argvCaptureFile,
          MAESTRO_TEST_STDIN_CAPTURE: stdinCaptureFile,
          MAESTRO_DEFAULT_MODEL: 'gemini-2.5-pro',
          MAESTRO_GEMINI_EXTRA_ARGS: '--sandbox --policy .gemini/policies/maestro.toml',
          MAESTRO_AGENT_TIMEOUT: '2',
          MAESTRO_MAX_CONCURRENT: '1',
          MAESTRO_STAGGER_DELAY: '0',
        },
        timeout: 30000,
      }
    );

    assert.equal(exitCode, 0, `Expected exit 0 but got ${exitCode}.\nstdout: ${stdout}`);

    const capturedArgv = JSON.parse(fs.readFileSync(argvCaptureFile, 'utf8'));

    assert.ok(
      capturedArgv.includes('--approval-mode=yolo'),
      `Missing --approval-mode=yolo in argv: ${JSON.stringify(capturedArgv)}`
    );

    const outputFormatIdx = capturedArgv.indexOf('--output-format');
    assert.notEqual(outputFormatIdx, -1, `Missing --output-format in argv: ${JSON.stringify(capturedArgv)}`);
    assert.equal(
      capturedArgv[outputFormatIdx + 1],
      'json',
      `Expected --output-format json but got: ${capturedArgv[outputFormatIdx + 1]}`
    );

    const modelFlagIdx = capturedArgv.indexOf('-m');
    assert.notEqual(modelFlagIdx, -1, `Missing -m flag in argv: ${JSON.stringify(capturedArgv)}`);
    assert.equal(
      capturedArgv[modelFlagIdx + 1],
      'gemini-2.5-pro',
      `Expected model gemini-2.5-pro but got: ${capturedArgv[modelFlagIdx + 1]}`
    );

    assert.ok(
      capturedArgv.includes('--sandbox'),
      `Missing --sandbox in argv: ${JSON.stringify(capturedArgv)}`
    );

    const policyIdx = capturedArgv.indexOf('--policy');
    assert.notEqual(policyIdx, -1, `Missing --policy in argv: ${JSON.stringify(capturedArgv)}`);
    assert.equal(
      capturedArgv[policyIdx + 1],
      '.gemini/policies/maestro.toml',
      `Expected policy path .gemini/policies/maestro.toml but got: ${capturedArgv[policyIdx + 1]}`
    );

    assert.ok(
      !capturedArgv.includes('--prompt'),
      `Unexpected deprecated --prompt flag found in argv: ${JSON.stringify(capturedArgv)}`
    );

    const stdinPayload = fs.readFileSync(stdinCaptureFile, 'utf8');
    assert.ok(
      stdinPayload.includes('PROJECT ROOT:'),
      `Expected stdin to contain PROJECT ROOT preamble.\nstdin: ${stdinPayload}`
    );
    assert.ok(
      stdinPayload.includes('Review the project architecture'),
      `Expected stdin to contain prompt file content.\nstdin: ${stdinPayload}`
    );

    const resultFile = path.join(dispatchDir, 'results', 'architect.json');
    assert.ok(
      fs.existsSync(resultFile),
      `Expected result file to exist at: ${resultFile}`
    );
  });
});
