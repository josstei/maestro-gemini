'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  hookPath,
  runHookJson,
  cleanHookState,
  hookStateSessionExists,
  writeHookStateAgent,
} = require('./helpers');

const SESSION_END_HOOK = hookPath('session-end.js');

describe('SessionEnd hook', { concurrency: 1 }, () => {
  afterEach(() => {
    cleanHookState('test-se-001');
    cleanHookState('test-se-002');
  });

  it('cleans up existing state directory', () => {
    writeHookStateAgent('test-se-001', 'some-agent');

    const input = {
      session_id: 'test-se-001',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'SessionEnd',
      timestamp: '2026-02-17T00:00:00Z',
      reason: 'exit',
    };

    const result = runHookJson(SESSION_END_HOOK, input);

    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
    assert.equal(hookStateSessionExists('test-se-001'), false);
  });

  it('handles non-existent state directory without error', () => {
    cleanHookState('test-se-002');

    const input = {
      session_id: 'test-se-002',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'SessionEnd',
      timestamp: '2026-02-17T00:00:00Z',
      reason: 'exit',
    };

    const result = runHookJson(SESSION_END_HOOK, input);

    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
  });

  it('rejects invalid session_id gracefully', () => {
    const input = {
      session_id: '../../../etc',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'SessionEnd',
      timestamp: '2026-02-17T00:00:00Z',
      reason: 'exit',
    };

    const result = runHookJson(SESSION_END_HOOK, input);

    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
  });
});
