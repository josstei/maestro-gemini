#!/usr/bin/env node
'use strict';

const { ensureWorkspace } = require('../src/lib/state/session-state');
const { fatal } = require('../src/lib/core/logger');

const stateDir = process.argv[2] || '.gemini';
const basePath = process.cwd();

try {
  ensureWorkspace(stateDir, basePath);
} catch (err) {
  fatal(err.message);
}
