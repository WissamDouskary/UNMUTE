import assert from 'node:assert/strict';
import test from 'node:test';
import { captureScreenCopy, shouldDeleteStagedShare } from './shareInbox.ts';

test('a logged-out share is kept and explained', () => {
  assert.equal(shouldDeleteStagedShare('kept'), false);
  assert.equal(shouldDeleteStagedShare('uploaded'), true);
  assert.equal(captureScreenCopy('kept'), 'Sent to your inbox after you sign in.');
  assert.equal(captureScreenCopy('empty'), 'Nothing was shared.');
  assert.equal(captureScreenCopy('rejected'), 'This file type cannot be captured.');
  assert.equal(captureScreenCopy('uploaded'), 'Sent to your inbox.');
});
