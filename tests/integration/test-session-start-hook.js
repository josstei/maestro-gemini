'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  hookPath,
  runHookJson,
  createTempDir,
  writeSessionState,
  cleanHookState,
  hookStateSessionExists,
  removeTempDir,
} = require('./helpers');

const HOOK_FILE = hookPath('session-start.js');

const ACTIVE_SESSION_CONTENT = 'session_id: "test-active"\nstatus: "in_progress"';

const buildInput = (sessionId, cwd, source) => ({
  session_id: sessionId,
  transcript_path: '/tmp/transcript',
  cwd,
  hook_event_name: 'SessionStart',
  timestamp: '2026-02-17T00:00:00Z',
  source,
});

describe('SessionStart hook', { concurrency: 1 }, () => {
  let inactiveCwd;
  let activeCwd;

  before(() => {
    inactiveCwd = createTempDir('maestro-test-session-start-inactive-');
    activeCwd = createTempDir('maestro-test-session-start-active-');
    writeSessionState(activeCwd, ACTIVE_SESSION_CONTENT);
  });

  after(() => {
    removeTempDir(inactiveCwd);
    removeTempDir(activeCwd);
  });

  it('returns valid JSON', () => {
    const result = runHookJson(HOOK_FILE, buildInput('test-start-001', inactiveCwd, 'startup'));
    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
  });

  it('inactive workspace does not initialize hook state', () => {
    runHookJson(HOOK_FILE, buildInput('test-start-001', inactiveCwd, 'startup'));
    assert.equal(hookStateSessionExists('test-start-001'), false);
  });

  it('startup source initializes state when active session exists', () => {
    const sessionId = 'test-start-startup-active';
    const result = runHookJson(HOOK_FILE, buildInput(sessionId, activeCwd, 'startup'));
    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
    assert.equal(hookStateSessionExists(sessionId), true);
    cleanHookState(sessionId);
  });

  it('fires with source=resume and returns valid JSON', () => {
    const result = runHookJson(HOOK_FILE, buildInput('test-start-resume', activeCwd, 'resume'));
    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
  });

  it('session state directory created for resume source', () => {
    runHookJson(HOOK_FILE, buildInput('test-start-resume', activeCwd, 'resume'));
    assert.equal(hookStateSessionExists('test-start-resume'), true);
    cleanHookState('test-start-resume');
  });

  it('fires with source=clear and returns valid JSON', () => {
    const result = runHookJson(HOOK_FILE, buildInput('test-start-clear', activeCwd, 'clear'));
    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
  });

  it('session state directory created for clear source', () => {
    runHookJson(HOOK_FILE, buildInput('test-start-clear', activeCwd, 'clear'));
    assert.equal(hookStateSessionExists('test-start-clear'), true);
    cleanHookState('test-start-clear');
  });

  it('all three sources produce consistent JSON output', () => {
    const startupResult = runHookJson(HOOK_FILE, buildInput('test-start-consistency-startup', activeCwd, 'startup'));
    const resumeResult = runHookJson(HOOK_FILE, buildInput('test-start-consistency-resume', activeCwd, 'resume'));
    const clearResult = runHookJson(HOOK_FILE, buildInput('test-start-consistency-clear', activeCwd, 'clear'));

    assert.deepEqual(startupResult, {});
    assert.deepEqual(resumeResult, {});
    assert.deepEqual(clearResult, {});

    cleanHookState('test-start-consistency-startup');
    cleanHookState('test-start-consistency-resume');
    cleanHookState('test-start-consistency-clear');
  });
});
