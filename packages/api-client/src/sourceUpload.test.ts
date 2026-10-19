import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFilePart } from './sourceUpload.ts';

test('the part uses the backend field name file', () => {
  const part = sourceFilePart({ uri: 'file:///tmp/a.m4a', name: 'capture-1.m4a', type: 'audio/mp4' });
  assert.deepEqual(part, { uri: 'file:///tmp/a.m4a', name: 'capture-1.m4a', type: 'audio/mp4' });
});
