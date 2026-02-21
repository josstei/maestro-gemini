'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('../../src/lib/core/project-root-resolver');

describe('resolveProjectRoot()', () => {
  it('returns a non-empty string', () => {
    const root = resolveProjectRoot();
    assert.ok(root.length > 0);
  });

  it('returns an absolute path', () => {
    const root = resolveProjectRoot();
    assert.ok(path.isAbsolute(root));
  });

  it('returns a path that exists', () => {
    const root = resolveProjectRoot();
    assert.ok(fs.existsSync(root));
  });
});
