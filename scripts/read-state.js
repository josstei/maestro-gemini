#!/usr/bin/env node
'use strict';

const { readState } = require('../src/lib/state');

const stateFile = process.argv[2];
if (!stateFile) {
  process.stderr.write('Usage: read-state.js <relative-path>\n');
  process.exit(1);
}

try {
  const content = readState(stateFile, process.cwd());
  process.stdout.write(content);
} catch (err) {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
}
