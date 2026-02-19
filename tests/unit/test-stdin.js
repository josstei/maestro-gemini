'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { get, getBool, getNested } = require('../../src/lib/stdin');

describe('stdin helpers', () => {
  describe('get()', () => {
    it('returns value for existing key', () => {
      assert.equal(get({ foo: 'bar' }, 'foo'), 'bar');
    });

    it('returns empty string for missing key', () => {
      assert.equal(get({ foo: 'bar' }, 'baz'), '');
    });

    it('returns empty string for null obj', () => {
      assert.equal(get(null, 'foo'), '');
    });
  });

  describe('getBool()', () => {
    it('returns true for truthy value', () => {
      assert.equal(getBool({ a: true }, 'a'), true);
    });

    it('returns true for string "true"', () => {
      assert.equal(getBool({ a: 'true' }, 'a'), true);
    });

    it('returns false for missing key', () => {
      assert.equal(getBool({ a: true }, 'b'), false);
    });

    it('returns false for falsy value', () => {
      assert.equal(getBool({ a: false }, 'a'), false);
    });
  });

  describe('getNested()', () => {
    it('traverses nested objects', () => {
      const obj = { a: { b: { c: 'deep' } } };
      assert.equal(getNested(obj, 'a', 'b', 'c'), 'deep');
    });

    it('returns empty string for missing path', () => {
      assert.equal(getNested({ a: { b: 1 } }, 'a', 'x', 'y'), '');
    });

    it('returns JSON for non-string leaf', () => {
      const obj = { a: { b: [1, 2] } };
      assert.equal(getNested(obj, 'a', 'b'), '[1,2]');
    });
  });
});
