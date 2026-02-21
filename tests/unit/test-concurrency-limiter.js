'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ConcurrencyLimiter } = require('../../src/lib/dispatch/concurrency-limiter');

describe('ConcurrencyLimiter', () => {
  it('unlimited mode (max=0): acquire always resolves', async () => {
    const limiter = new ConcurrencyLimiter(0);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    limiter.release();
    limiter.release();
    limiter.release();
  });

  it('under limit: acquire resolves immediately', async () => {
    const limiter = new ConcurrencyLimiter(2);
    await limiter.acquire();
    await limiter.acquire();
    limiter.release();
    limiter.release();
  });

  it('at limit: acquire blocks until release', async () => {
    const limiter = new ConcurrencyLimiter(1);
    await limiter.acquire();

    let resolved = false;
    const pending = limiter.acquire().then(() => { resolved = true; });

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(resolved, false);

    limiter.release();
    await pending;
    assert.equal(resolved, true);

    limiter.release();
  });

  it('multiple waiters served FIFO', async () => {
    const limiter = new ConcurrencyLimiter(1);
    await limiter.acquire();

    const order = [];
    const p1 = limiter.acquire().then(() => { order.push('first'); });
    const p2 = limiter.acquire().then(() => { order.push('second'); });

    limiter.release();
    await p1;
    limiter.release();
    await p2;
    limiter.release();

    assert.deepEqual(order, ['first', 'second']);
  });

  it('release with no waiters is safe', () => {
    const limiter = new ConcurrencyLimiter(2);
    limiter.release();
  });
});
