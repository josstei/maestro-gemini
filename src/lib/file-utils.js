'use strict';

const fs = require('fs');
const path = require('path');

function atomicWriteSync(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpFile = filePath + `.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, content);
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

module.exports = { atomicWriteSync };
