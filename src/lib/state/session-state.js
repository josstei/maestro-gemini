'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../core/atomic-write');

const DEFAULT_STATE_DIR = '.gemini';

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error(`Path must be relative (got: ${filePath})`);
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error(`Path traversal not allowed (got: ${filePath})`);
  }
}

function resolveActiveSessionPath(cwd) {
  const stateDir = process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;

  if (path.isAbsolute(stateDir)) {
    return path.join(stateDir, 'state', 'active-session.md');
  }

  validateRelativePath(stateDir);
  const base = cwd || process.cwd();
  return path.join(base, stateDir, 'state', 'active-session.md');
}

function hasActiveSession(cwd) {
  try {
    const sessionPath = resolveActiveSessionPath(cwd);
    return fs.existsSync(sessionPath);
  } catch {
    return false;
  }
}

function readState(relativePath, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function writeState(relativePath, content, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  atomicWriteSync(fullPath, content);
}

function ensureWorkspace(stateDir, basePath) {
  validateRelativePath(stateDir);
  const fullBase = path.join(basePath, stateDir);
  try {
    const stats = fs.lstatSync(fullBase);
    if (stats.isSymbolicLink()) {
      throw new Error(`STATE_DIR must not be a symlink (got: ${stateDir})`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const dirs = [
    path.join(fullBase, 'state'),
    path.join(fullBase, 'state', 'archive'),
    path.join(fullBase, 'plans'),
    path.join(fullBase, 'plans', 'archive'),
    path.join(fullBase, 'parallel'),
  ];
  for (const dir of dirs) {
    const relativeDir = path.relative(basePath, dir) || dir;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      throw new Error(`Failed to create directory: ${relativeDir}`);
    }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(`Directory not writable: ${relativeDir}`);
    }
  }
}

module.exports = {
  DEFAULT_STATE_DIR,
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
};
