import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSupported, shareManifest } from './shareManifest.ts';

test('nothing shared stays empty', () => {
  assert.deepEqual(shareManifest({ id: 's1', files: [] }), { empty: true });
});

test('text without a file becomes share.txt', () => {
  const manifest = shareManifest({ id: 's2', text: 'Call Alex', files: [] });
  assert.equal(manifest && 'files' in manifest && manifest.files[0]?.name, 'share.txt');
  assert.equal(manifest && 'notice' in manifest && manifest.notice, 'The file did not arrive.');
});

test('only the first supported file is kept', () => {
  const manifest = shareManifest({
    id: 's3',
    files: [
      { name: 'a.pdf', type: 'application/pdf' },
      { name: 'b.pdf', type: 'application/pdf' },
    ],
  });
  assert.equal(manifest && 'files' in manifest && manifest.files.length, 1);
  assert.equal(manifest && 'notice' in manifest && manifest.notice, 'Only the first file was captured.');
});

test('an unsupported file is refused', () => {
  assert.equal(captureSupported('video/quicktime'), false);
  assert.deepEqual(
    shareManifest({ id: 's4', files: [{ name: 'clip.mov', type: 'video/quicktime' }] }),
    { rejected: true, message: 'This file type cannot be captured.' },
  );
});

test('the manifest has no token fields', () => {
  const manifest = shareManifest({ id: 's5', text: 'note', files: [] });
  assert.deepEqual(Object.keys(manifest).sort(), ['files', 'id', 'notice', 'text', 'title', 'url']);
});
