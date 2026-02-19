#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolveSetting } = require('../src/lib/settings');
const { readState } = require('../src/lib/state');

function resolveProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function main() {
  const projectRoot = resolveProjectRoot();
  const stateDir = resolveSetting('MAESTRO_STATE_DIR', projectRoot) || '.gemini';

  if (path.isAbsolute(stateDir)) {
    const stateFile = path.join(stateDir, 'state', 'active-session.md');
    try {
      const content = fs.readFileSync(stateFile, 'utf8');
      process.stdout.write(content);
    } catch {
      process.stdout.write('No active session\n');
    }
    return;
  }

  try {
    const content = readState(path.join(stateDir, 'state', 'active-session.md'), projectRoot);
    process.stdout.write(content);
  } catch {
    process.stdout.write('No active session\n');
  }
}

main();
