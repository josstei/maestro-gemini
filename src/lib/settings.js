'use strict';

const fs = require('fs');
const path = require('path');

function trimQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(filePath) {
  const result = {};
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return result;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const rawValue = trimmed.slice(eqIndex + 1);
    result[key] = trimQuotes(rawValue);
  }
  return result;
}

function resolveSetting(varName, projectRoot) {
  const envValue = process.env[varName];
  if (envValue !== undefined && envValue !== '') return envValue;

  const projectEnv = parseEnvFile(path.join(projectRoot, '.env'));
  if (projectEnv[varName] !== undefined) return projectEnv[varName];

  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH ||
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.gemini', 'extensions', 'maestro');
  const extEnv = parseEnvFile(path.join(extensionRoot, '.env'));
  if (extEnv[varName] !== undefined) return extEnv[varName];

  return undefined;
}

module.exports = { parseEnvFile, resolveSetting };
