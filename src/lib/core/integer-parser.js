'use strict';

const { fatal } = require('./logger');

function isStrictInteger(value) {
  return typeof value === 'string' && /^[0-9]+$/.test(value);
}

function parsePositiveInteger(varName, rawValue) {
  if (!isStrictInteger(rawValue)) {
    fatal(`${varName} must be a positive integer (got: ${rawValue})`);
  }
  const parsed = Number(rawValue);
  if (parsed <= 0) {
    fatal(`${varName} must be a positive integer (got: ${rawValue})`);
  }
  return parsed;
}

function parseNonNegativeInteger(varName, rawValue) {
  if (!isStrictInteger(rawValue)) {
    fatal(`${varName} must be a non-negative integer (got: ${rawValue})`);
  }
  return Number(rawValue);
}

module.exports = { isStrictInteger, parsePositiveInteger, parseNonNegativeInteger };
