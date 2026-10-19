import assert from 'node:assert/strict';
import test from 'node:test';
import { recordingPolicy, recordingUpload } from './recordingFile.ts';

test('a take is an m4a audio file and does not keep recording in the background', () => {
  assert.deepEqual(recordingUpload(1710000000000, 'file:///tmp/take.m4a'), {
    uri: 'file:///tmp/take.m4a',
    name: 'capture-1710000000000.m4a',
    type: 'audio/mp4',
  });
  assert.deepEqual(recordingPolicy, { backgroundRecording: false, uploadSession: 'BACKGROUND' });
});
