#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const { readdirSync } = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;
const UNIT_DIR = path.join(TESTS_DIR, 'unit');
const INTEGRATION_DIR = path.join(TESTS_DIR, 'integration');

function discoverTests(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith('test-') && f.endsWith('.js'))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

const unitTests = discoverTests(UNIT_DIR);
const integrationTests = discoverTests(INTEGRATION_DIR);
const allTests = [...unitTests, ...integrationTests];

if (allTests.length === 0) {
  process.stderr.write('ERROR: No test files found\n');
  process.exit(1);
}

console.log('Maestro Test Suite');
console.log('==================');
console.log(`Unit tests:        ${unitTests.length} files`);
console.log(`Integration tests: ${integrationTests.length} files`);
console.log(`Total:             ${allTests.length} files`);
console.log('');

try {
  execFileSync('node', ['--test', ...allTests], {
    stdio: 'inherit',
    timeout: 120000,
  });
} catch (err) {
  process.exit(err.status || 1);
}
