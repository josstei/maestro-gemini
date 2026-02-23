'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  hookPath,
  runHookJson,
  cleanHookState,
  readHookStateAgent,
  writeHookStateAgent,
} = require('./helpers');

const AFTER_AGENT_HOOK = hookPath('after-agent.js');

const WELL_FORMED_RESPONSE =
  '## Task Report\nStatus: success\n## Downstream Context\nNo downstream dependencies.';

describe('AfterAgent hook', { concurrency: 1 }, () => {
  afterEach(() => {
    cleanHookState('test-after-001');
    cleanHookState('test-after-002');
    cleanHookState('test-after-003');
    cleanHookState('test-after-004');
    cleanHookState('test-after-005');
  });

  it('validates well-formed handoff report and allows', () => {
    writeHookStateAgent('test-after-001', 'coder');

    const input = {
      session_id: 'test-after-001',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'AfterAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt_response: WELL_FORMED_RESPONSE,
      stop_hook_active: false,
    };

    const result = runHookJson(AFTER_AGENT_HOOK, input);

    assert.equal(result.decision, 'allow');
    assert.equal(readHookStateAgent('test-after-001'), '');
  });

  it('denies malformed handoff report with reason', () => {
    writeHookStateAgent('test-after-002', 'coder');

    const input = {
      session_id: 'test-after-002',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'AfterAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt_response: 'I did some stuff but forgot the report format.',
      stop_hook_active: false,
    };

    const result = runHookJson(AFTER_AGENT_HOOK, input);

    assert.equal(result.decision, 'deny');
    assert.ok('reason' in result);
    assert.equal(readHookStateAgent('test-after-002'), '');
  });

  it('does not keep stale active agent after deny', () => {
    writeHookStateAgent('test-after-005', 'coder');

    const first = runHookJson(AFTER_AGENT_HOOK, {
      session_id: 'test-after-005',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'AfterAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt_response: 'missing expected sections',
      stop_hook_active: false,
    });
    assert.equal(first.decision, 'deny');

    const second = runHookJson(AFTER_AGENT_HOOK, {
      session_id: 'test-after-005',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'AfterAgent',
      timestamp: '2026-02-17T00:00:01Z',
      prompt_response: 'also missing expected sections',
      stop_hook_active: false,
    });
    assert.equal(second.decision, 'allow');
  });

  it('allows malformed report when stop_hook_active is true', () => {
    writeHookStateAgent('test-after-003', 'coder');

    const input = {
      session_id: 'test-after-003',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'AfterAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt_response: 'No report format here either.',
      stop_hook_active: true,
    };

    const result = runHookJson(AFTER_AGENT_HOOK, input);

    assert.equal(result.decision, 'allow');
  });

  it('allows without validation when no active agent is set', () => {
    const input = {
      session_id: 'test-after-004',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'AfterAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt_response: 'Just some text',
      stop_hook_active: false,
    };

    const result = runHookJson(AFTER_AGENT_HOOK, input);

    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
  });
});
