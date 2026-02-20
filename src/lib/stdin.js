'use strict';

function readText() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      resolve(chunks.join(''));
    });
    process.stdin.resume();
  });
}

function readJson() {
  return readText().then((raw) => {
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
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

module.exports = { readText, readJson, get, getBool };
