'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hookPath,
  runHook,
  runHookJson,
  createTempDir,
  writeSessionState,
  cleanHookState,
  readHookStateAgent,
  removeTempDir,
} = require('./helpers');

const HOOK_FILE = hookPath('before-agent.js');

describe('BeforeAgent hook', { concurrency: 1 }, () => {
  it('returns valid JSON with no session state', () => {
    const input = {
      session_id: 'test-789',
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'BeforeAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt: 'Implement the feature',
    };

    const raw = runHook(HOOK_FILE, input);
    const parsed = JSON.parse(raw);

    assert.equal(typeof parsed, 'object');
    assert.notEqual(parsed, null);
  });

  it('detects agent name from MAESTRO_CURRENT_AGENT env var', () => {
    const sessionId = 'test-ba-001';
    cleanHookState(sessionId);

    const input = {
      session_id: sessionId,
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'BeforeAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt: 'Implement the TODO API endpoint.',
    };

    const raw = runHook(HOOK_FILE, input, { MAESTRO_CURRENT_AGENT: 'coder' });
    JSON.parse(raw);

    assert.equal(readHookStateAgent(sessionId), 'coder');
    cleanHookState(sessionId);
  });

  it('falls back to prompt-based delegation-pattern detection', () => {
    const sessionId = 'test-ba-004';
    cleanHookState(sessionId);

    const input = {
      session_id: sessionId,
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'BeforeAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt: 'delegate to tester to run the test suite',
    };

    const raw = runHook(HOOK_FILE, input, { MAESTRO_CURRENT_AGENT: '' });
    JSON.parse(raw);

    assert.equal(readHookStateAgent(sessionId), 'tester');
    cleanHookState(sessionId);
  });

  it('injects additionalContext when session state exists', () => {
    const tempDir = createTempDir('maestro-test-before-');

    try {
      const stateContent = [
        '---',
        'session_id: test-session',
        'current_phase: phase-2-implementation',
        'status: in_progress',
        '---',
        'Phase 2 is active.',
      ].join('\n');

      writeSessionState(tempDir, stateContent);

      const input = {
        session_id: 'test-ba-002',
        transcript_path: '/tmp/t',
        cwd: tempDir,
        hook_event_name: 'BeforeAgent',
        timestamp: '2026-02-17T00:00:00Z',
        prompt: 'Continue working',
      };

      const result = runHookJson(HOOK_FILE, input);

      assert.equal(result.decision, 'allow');
      assert.equal(result.hookSpecificOutput.hookEventName, 'BeforeAgent');
      assert.ok(result.hookSpecificOutput.additionalContext.includes('current_phase=phase-2-implementation'));
      assert.ok(result.hookSpecificOutput.additionalContext.includes('status=in_progress'));
    } finally {
      removeTempDir(tempDir);
    }
  });

  it('honors MAESTRO_STATE_DIR for relative custom state path', () => {
    const tempDir = createTempDir('maestro-test-before-rel-');

    try {
      const stateContent = [
        '---',
        'session_id: test-session',
        'current_phase: phase-4-validation',
        'status: in_progress',
        '---',
      ].join('\n');

      writeSessionState(tempDir, stateContent, '.maestro');

      const input = {
        session_id: 'test-ba-005',
        transcript_path: '/tmp/t',
        cwd: tempDir,
        hook_event_name: 'BeforeAgent',
        timestamp: '2026-02-17T00:00:00Z',
        prompt: 'Continue working',
      };

      const result = runHookJson(HOOK_FILE, input, { MAESTRO_STATE_DIR: '.maestro' });

      assert.ok(result.hookSpecificOutput.additionalContext.includes('current_phase=phase-4-validation'));
      assert.ok(result.hookSpecificOutput.additionalContext.includes('status=in_progress'));
    } finally {
      removeTempDir(tempDir);
    }
  });

  it('honors MAESTRO_STATE_DIR for absolute custom state path', () => {
    const absStateRoot = createTempDir('maestro-test-absstate-');

    try {
      const stateContent = [
        '---',
        'session_id: test-session',
        'current_phase: phase-5-docs',
        'status: in_progress',
        '---',
      ].join('\n');

      writeSessionState(absStateRoot, stateContent, '');

      const input = {
        session_id: 'test-ba-006',
        transcript_path: '/tmp/t',
        cwd: '/tmp',
        hook_event_name: 'BeforeAgent',
        timestamp: '2026-02-17T00:00:00Z',
        prompt: 'Continue working',
      };

      const result = runHookJson(HOOK_FILE, input, { MAESTRO_STATE_DIR: absStateRoot });

      assert.ok(result.hookSpecificOutput.additionalContext.includes('current_phase=phase-5-docs'));
      assert.ok(result.hookSpecificOutput.additionalContext.includes('status=in_progress'));
    } finally {
      removeTempDir(absStateRoot);
    }
  });

  it('returns allow with no context when session state missing', () => {
    const input = {
      session_id: 'test-ba-missing',
      transcript_path: '/tmp/t',
      cwd: '/tmp/nonexistent',
      hook_event_name: 'BeforeAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt: 'Continue working',
    };

    const result = runHookJson(HOOK_FILE, input);

    assert.equal(result.decision, 'allow');
  });

  it('casual agent name mention does not trigger detection', () => {
    const sessionId = 'test-ba-casual';
    cleanHookState(sessionId);

    const input = {
      session_id: sessionId,
      transcript_path: '/tmp/t',
      cwd: '/tmp',
      hook_event_name: 'BeforeAgent',
      timestamp: '2026-02-17T00:00:00Z',
      prompt: 'You are the tester agent. Run the test suite.',
    };

    runHook(HOOK_FILE, input, { MAESTRO_CURRENT_AGENT: '' });

    assert.equal(readHookStateAgent(sessionId), '');
    cleanHookState(sessionId);
  });
});
