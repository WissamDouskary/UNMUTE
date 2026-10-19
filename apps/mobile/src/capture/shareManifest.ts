export type ShareFile = { name: string; type: string };

export type ShareManifest = {
  id: string;
  title: string;
  text: string;
  url: string;
  files: ShareFile[];
  notice: string | null;
};

const EXACT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

export function captureSupported(mime: string): boolean {
  const type = mime.trim().toLowerCase().split(';', 1)[0] ?? '';
  return type.startsWith('audio/') || EXACT_TYPES.has(type);
}

export function shareManifest(input: {
  id: string;
  title?: string;
  text?: string;
  url?: string;
  files: ShareFile[];
}): ShareManifest | { empty: true } | { rejected: true; message: string } {
  const title = (input.title ?? '').trim();
  const text = (input.text ?? '').trim();
  const url = (input.url ?? '').trim();
  const supported = input.files.filter((file) => captureSupported(file.type));

  if (input.files.length === 0 && text === '' && title === '' && url === '') {
    return { empty: true };
  }

  if (supported.length === 0 && text !== '') {
    return {
      id: input.id,
      title,
      text,
      url,
      files: [{ name: 'share.txt', type: 'text/plain' }],
      notice: 'The file did not arrive.',
    };
  }

  if (supported.length === 0) {
    if (input.files.length > 0) {
      return { rejected: true, message: 'This file type cannot be captured.' };
    }
    return { id: input.id, title, text, url, files: [], notice: null };
  }

  const file = supported[0];
  return {
    id: input.id,
    title,
    text,
    url,
    files: [{ name: file.name, type: file.type }],
    notice: input.files.length > 1 ? 'Only the first file was captured.' : null,
  };
}
