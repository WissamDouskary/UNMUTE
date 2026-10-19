import type { ShareFile, ShareManifest } from './shareManifest';

export type ShareInboxResult = 'uploaded' | 'kept' | 'empty' | 'rejected';

type NativeShareInbox = {
  read(id: string): Promise<string | null>;
  list(): Promise<string[]>;
  fileUri(id: string, name: string): Promise<string | null>;
  remove(id: string): Promise<void>;
};

const missingNativeShareInbox: NativeShareInbox = {
  async read() {
    return null;
  },
  async list() {
    return [];
  },
  async fileUri() {
    return null;
  },
  async remove() {},
};

async function nativeShareInbox(): Promise<NativeShareInbox> {
  try {
    const reactNative = await import('react-native');
    const candidate = reactNative.NativeModules?.UnmuteShareInbox;
    if (
      candidate &&
      typeof candidate.read === 'function' &&
      typeof candidate.list === 'function' &&
      typeof candidate.fileUri === 'function' &&
      typeof candidate.remove === 'function'
    ) {
      return candidate;
    }
  } catch {
    // Expo Go and this Windows machine have no compiled share inbox.
  }
  return missingNativeShareInbox;
}

export const UnmuteShareInbox: NativeShareInbox = {
  read(id) {
    return nativeShareInbox().then((native) => native.read(id));
  },
  list() {
    return nativeShareInbox().then((native) => native.list());
  },
  fileUri(id, name) {
    return nativeShareInbox().then((native) => native.fileUri(id, name));
  },
  remove(id) {
    return nativeShareInbox().then((native) => native.remove(id));
  },
};

export function shouldDeleteStagedShare(result: ShareInboxResult): boolean {
  return result === 'uploaded';
}

export function captureScreenCopy(result: ShareInboxResult): string {
  switch (result) {
    case 'uploaded':
      return 'Sent to your inbox.';
    case 'kept':
      return 'Sent to your inbox after you sign in.';
    case 'empty':
      return 'Nothing was shared.';
    case 'rejected':
      return 'This file type cannot be captured.';
  }
}

async function loadShareManifest(): Promise<typeof import('./shareManifest')> {
  return import('./shareManifest');
}

export async function readStagedShare(
  id: string,
): Promise<ShareManifest | { empty: true } | { rejected: true; message: string }> {
  const raw = await UnmuteShareInbox.read(id);
  if (raw == null) {
    return { empty: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { empty: true };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { empty: true };
  }

  const record = parsed as Record<string, unknown>;
  const files: ShareFile[] = Array.isArray(record.files)
    ? record.files.flatMap((file) => {
        if (!file || typeof file !== 'object') return [];
        const entry = file as { name?: unknown; type?: unknown };
        if (typeof entry.name !== 'string' || typeof entry.type !== 'string') return [];
        return [{ name: entry.name, type: entry.type }];
      })
    : [];

  const { shareManifest } = await loadShareManifest();
  return shareManifest({
    id: typeof record.id === 'string' && record.id ? record.id : id,
    title: typeof record.title === 'string' ? record.title : undefined,
    text: typeof record.text === 'string' ? record.text : undefined,
    url: typeof record.url === 'string' ? record.url : undefined,
    files,
  });
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function currentAccessToken(client: { getAccessToken?: () => string | null }): string | null {
  const token = client.getAccessToken?.();
  return token ? token : null;
}

export async function uploadStagedShare(id: string): Promise<ShareInboxResult> {
  const { mobileStorage } = await import('../services/storage');
  const storedRefreshToken = await mobileStorage.getRefreshToken();
  if (storedRefreshToken == null) {
    return 'kept';
  }

  const staged = await readStagedShare(id);
  if ('empty' in staged) {
    return 'empty';
  }
  if ('rejected' in staged) {
    return 'rejected';
  }

  const file = staged.files[0];
  if (!file) {
    return 'empty';
  }

  const uri = await UnmuteShareInbox.fileUri(id, file.name);
  if (!uri) {
    return 'empty';
  }

  const { apiClient } = await import('@unmute/api-client');
  const tokenClient = apiClient as typeof apiClient & { getAccessToken?: () => string | null };
  if (!currentAccessToken(tokenClient)) {
    const refreshed = await apiClient.refresh(storedRefreshToken);
    await mobileStorage.setTokens(refreshed.accessToken, refreshed.refreshToken);
    const accessToken = refreshed.accessToken;
    apiClient.setTokenGetter(() => accessToken);
  }

  try {
    await apiClient.uploadSourceFile({ uri, name: file.name, type: file.type });
  } catch (error) {
    if (errorStatus(error) === 429) {
      throw error;
    }
    throw error;
  }

  if (shouldDeleteStagedShare('uploaded')) {
    await UnmuteShareInbox.remove(id);
  }
  return 'uploaded';
}
