#!/usr/bin/env node
'use strict';

const { ensureWorkspace } = require('../src/lib/state');

const stateDir = process.argv[2] || '.gemini';
const basePath = process.cwd();

try {
  ensureWorkspace(stateDir, basePath);
} catch (err) {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
}
