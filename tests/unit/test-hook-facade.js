'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const { buildHookContext, response, validation, hookState, state, log } = require('../../src/lib/hooks/hook-facade');

describe('maestro facade', () => {
  describe('buildHookContext()', () => {
    it('extracts all fields from input', () => {
      const input = {
        session_id: 'sess-1',
        cwd: '/tmp/project',
        prompt: 'delegate to coder',
        hook_event_name: 'BeforeAgent',
        prompt_response: 'some response',
        stop_hook_active: true,
      };
      const ctx = buildHookContext(input);
      assert.equal(ctx.sessionId, 'sess-1');
      assert.equal(ctx.cwd, '/tmp/project');
      assert.equal(ctx.prompt, 'delegate to coder');
      assert.equal(ctx.hookEventName, 'BeforeAgent');
      assert.equal(ctx.promptResponse, 'some response');
      assert.equal(ctx.stopHookActive, true);
      assert.equal(ctx.input, input);
    });

    it('defaults missing fields to empty strings / false', () => {
      const ctx = buildHookContext({});
      assert.equal(ctx.sessionId, '');
      assert.equal(ctx.cwd, '');
      assert.equal(ctx.prompt, '');
      assert.equal(ctx.hookEventName, '');
      assert.equal(ctx.promptResponse, '');
      assert.equal(ctx.stopHookActive, false);
    });
  });

  describe('namespaced re-exports', () => {
    it('exposes response functions', () => {
      assert.equal(typeof response.allow, 'function');
      assert.equal(typeof response.deny, 'function');
      assert.equal(typeof response.allowWithContext, 'function');
      assert.equal(typeof response.advisory, 'function');
    });

    it('exposes validation functions', () => {
      assert.equal(typeof validation.validateSessionId, 'function');
      assert.equal(typeof validation.detectAgentFromPrompt, 'function');
    });

    it('exposes hookState functions', () => {
      assert.equal(typeof hookState.pruneStale, 'function');
      assert.equal(typeof hookState.setActiveAgent, 'function');
      assert.equal(typeof hookState.getActiveAgent, 'function');
    });

    it('exposes state functions', () => {
      assert.equal(typeof state.hasActiveSession, 'function');
      assert.equal(typeof state.resolveActiveSessionPath, 'function');
    });

    it('exposes log function', () => {
      assert.equal(typeof log, 'function');
    });
  });

  describe('defineHook()', () => {
    const helperScript = path.join(__dirname, '..', 'helpers', 'defineHook-helper.js');

    it('handler output flows to stdout', () => {
      const result = execFileSync('node', [helperScript, 'success'], {
        input: JSON.stringify({ session_id: 'test-123' }),
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.trim(), '{"result":"ok","sid":"test-123"}');
    });

    it('error triggers fallback response', () => {
      const result = execFileSync('node', [helperScript, 'error'], {
        input: JSON.stringify({}),
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.trim(), '{"fallback":true}');
    });
  });
});
