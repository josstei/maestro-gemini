#!/usr/bin/env node
'use strict';

const { ensureWorkspace } = require('../src/lib/state');
const { fatal } = require('../src/lib/logger');

const stateDir = process.argv[2] || '.gemini';
const basePath = process.cwd();

try {
  ensureWorkspace(stateDir, basePath);
} catch (err) {
  fatal(err.message);
}
