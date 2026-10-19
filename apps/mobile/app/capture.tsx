import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { captureScreenCopy, uploadStagedShare } from '../src/capture/shareInbox';

function shareId(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isRateLimited(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'status' in error && (error as { status?: unknown }).status === 429;
}

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = shareId(params.id);
  const [message, setMessage] = useState(id ? '' : 'Nothing was shared.');

  useEffect(() => {
    if (!id) {
      setMessage('Nothing was shared.');
      return;
    }

    let cancelled = false;
    uploadStagedShare(id)
      .then((result) => {
        if (!cancelled) setMessage(captureScreenCopy(result));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isRateLimited(error)) {
          setMessage('Too many requests. Try again later.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <View style={styles.screen}>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  message: {
    color: '#f4f4f5',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '500',
  },
});
