'use strict';

function readJson() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }

    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const raw = chunks.join('');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    process.stdin.resume();
  });
}

function get(obj, key) {
  if (obj == null || typeof obj !== 'object') return '';
  const val = obj[key];
  return val == null ? '' : val;
}

function getBool(obj, key) {
  if (obj == null || typeof obj !== 'object') return false;
  const val = obj[key];
  if (val === true || val === 'true') return true;
  return false;
}

function getNested(obj, ...keys) {
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return '';
    current = current[key];
  }
  if (current == null) return '';
  if (typeof current === 'string') return current;
  return JSON.stringify(current);
}

module.exports = { readJson, get, getBool, getNested };
