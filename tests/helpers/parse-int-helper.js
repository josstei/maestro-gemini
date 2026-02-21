#!/usr/bin/env node
'use strict';

const { parsePositiveInteger, parseNonNegativeInteger } = require('../../src/lib/core/integer-parser');

const type = process.argv[2];
const varName = process.argv[3];
const value = process.argv[4];

if (type === 'positive') {
  parsePositiveInteger(varName, value);
} else if (type === 'nonneg') {
  parseNonNegativeInteger(varName, value);
}
