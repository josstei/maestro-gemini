#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const { resolveSetting } = require('../src/lib/settings');
const { resolveActiveSessionPath } = require('../src/lib/state');

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

  const resolvedStateDir = resolveSetting('MAESTRO_STATE_DIR', projectRoot);
  if (resolvedStateDir) {
    process.env.MAESTRO_STATE_DIR = resolvedStateDir;
  }

  try {
    const sessionPath = resolveActiveSessionPath(projectRoot);
    const content = fs.readFileSync(sessionPath, 'utf8');
    process.stdout.write(content);
  } catch {
    process.stdout.write('No active session\n');
  }
}

main();
