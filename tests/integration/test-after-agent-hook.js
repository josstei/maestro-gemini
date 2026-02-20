'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { hookPath, runHookJson } = require('./helpers');

const AFTER_AGENT_HOOK = hookPath('after-agent.js');

const HOOK_STATE_DIR = '/tmp/maestro-hooks';

const WELL_FORMED_RESPONSE =
  '## Task Report\nStatus: success\n## Downstream Context\nNo downstream dependencies.';

function writeAgentState(sessionId, agentName) {
  const sessionDir = path.join(HOOK_STATE_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'active-agent'), agentName);
}

function readAgentState(sessionId) {
  const agentFile = path.join(HOOK_STATE_DIR, sessionId, 'active-agent');
  try {
    return fs.readFileSync(agentFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function cleanSessionState(sessionId) {
  fs.rmSync(path.join(HOOK_STATE_DIR, sessionId), { recursive: true, force: true });
}

describe('AfterAgent hook', () => {
  afterEach(() => {
    cleanSessionState('test-after-001');
    cleanSessionState('test-after-002');
    cleanSessionState('test-after-003');
    cleanSessionState('test-after-004');
  });

  it('validates well-formed handoff report and allows', () => {
    writeAgentState('test-after-001', 'coder');

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
    assert.equal(readAgentState('test-after-001'), '');
  });

  it('denies malformed handoff report with reason', () => {
    writeAgentState('test-after-002', 'coder');

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
  });

  it('allows malformed report when stop_hook_active is true', () => {
    writeAgentState('test-after-003', 'coder');

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
