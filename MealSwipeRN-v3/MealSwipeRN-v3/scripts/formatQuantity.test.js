require('sucrase/register');

const assert = require('node:assert/strict');
const { formatQuantity } = require('../src/utils/formatQuantity');

const cases = [
  { input: 0.666666, expected: '0.6' },
  { input: 1, expected: '1' },
  { input: 1.2, expected: '1.2' },
  { input: 1.29, expected: '1.2' },
  { input: 0.04, expected: '0' },
  { input: -0.04, expected: '0' },
  { input: Number.NaN, expected: '0' },
  { input: Number.POSITIVE_INFINITY, expected: '0' },
];

for (const testCase of cases) {
  assert.equal(
    formatQuantity(testCase.input),
    testCase.expected,
    `formatQuantity(${testCase.input})`
  );
}

console.log('formatQuantity tests passed');
