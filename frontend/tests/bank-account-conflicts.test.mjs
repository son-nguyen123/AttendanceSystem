import test from 'node:test'
import assert from 'node:assert/strict'
import { bankAccountConflictCodes } from '../src/bankAccountConflicts.ts'

const row = (code, account) => ({ employee_code: code, account_number: account })

test('pasted account warns for both employees, even outside a search filter', () => {
  const rows = [row('1412', '0012345678'), row('1413', '0012345678')]
  assert.deepEqual(bankAccountConflictCodes('1412', '00 1234 5678', rows), ['1413'])
  assert.deepEqual(bankAccountConflictCodes('1413', '0012345678', rows), ['1412'])
})

test('checks saved employees outside this payroll', () => {
  assert.deepEqual(bankAccountConflictCodes('1412', '0012345678', [row('1412', '0012345678')], [row('1413', '0012345678')]), ['1413'])
})

test('warning clears when edited account replaces stale saved data', () => {
  const rows = [row('1412', '0012345678'), row('1413', '9988776655')]
  const saved = [row('1413', '0012345678')]
  assert.deepEqual(bankAccountConflictCodes('1412', '0012345678', rows, saved), [])
})

test('empty input and unchanged own account do not warn', () => {
  assert.deepEqual(bankAccountConflictCodes('1412', '', [row('1413', '')]), [])
  assert.deepEqual(bankAccountConflictCodes('1412', '0012345678', [row('1412', '0012345678')]), [])
})
