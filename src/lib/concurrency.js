'use strict';

class ConcurrencyLimiter {
  constructor(maxConcurrent = 0) {
    this._max = maxConcurrent;
    this._active = 0;
    this._waiters = [];
  }

  acquire() {
    if (this._max === 0 || this._active < this._max) {
      this._active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._waiters.push(() => {
        this._active++;
        resolve();
      });
    });
  }

  release() {
    this._active--;
    if (this._waiters.length > 0) {
      const next = this._waiters.shift();
      next();
    }
  }
}

module.exports = { ConcurrencyLimiter };
