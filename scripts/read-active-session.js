#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { resolveSetting, resolveProjectRoot } = require('../src/lib/settings');
const { resolveActiveSessionPath } = require('../src/lib/state');

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
