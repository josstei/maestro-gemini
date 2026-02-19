#!/usr/bin/env node
'use strict';

const { writeState } = require('../src/lib/state');

const stateFile = process.argv[2];
if (!stateFile) {
  process.stderr.write('Usage: write-state.js <relative-path>\n');
  process.exit(1);
}

async function main() {
  const chunks = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const content = chunks.join('');
  writeState(stateFile, content, process.cwd());
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
});
