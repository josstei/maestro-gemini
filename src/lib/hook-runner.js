'use strict';

const { readJson } = require('./stdin');
const { log } = require('./logger');

function runHook(handler, fallbackResponseFn) {
  readJson()
    .then((input) => handler(input))
    .then((response) => {
      process.stdout.write(response + '\n');
    })
    .catch((err) => {
      log('ERROR', `Hook failed — returning safe default: ${err.message}`);
      process.stdout.write(fallbackResponseFn() + '\n');
    });
}

module.exports = { runHook };
