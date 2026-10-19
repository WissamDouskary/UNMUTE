import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { recordingPolicy, recordingUpload } from '../src/capture/recordingFile';

type ActiveRecording = {
  stopAndUnloadAsync: () => Promise<unknown>;
  getURI: () => string | null;
};

async function setRecordingMode(allowsRecordingIOS: boolean): Promise<void> {
  const { Audio } = await import('expo-av');
  await Audio.setAudioModeAsync({
    allowsRecordingIOS,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
}

function namedTakeUri(uri: string, name: string): string {
  const slash = uri.lastIndexOf('/');
  const directory = slash >= 0 ? uri.slice(0, slash + 1) : '';
  return `${directory}${name}`;
}

function currentAccessToken(client: { getAccessToken?: () => string | null }): string | null {
  const token = client.getAccessToken?.();
  return token ? token : null;
}

async function accessToken(): Promise<string | null> {
  const { apiClient } = await import('@unmute/api-client');
  const { mobileStorage } = await import('../src/services/storage');
  const tokenClient = apiClient as typeof apiClient & { getAccessToken?: () => string | null };
  const current = currentAccessToken(tokenClient);
  if (current) return current;

  const storedRefreshToken = await mobileStorage.getRefreshToken();
  if (storedRefreshToken == null) return null;

  const refreshed = await apiClient.refresh(storedRefreshToken);
  await mobileStorage.setTokens(refreshed.accessToken, refreshed.refreshToken);
  const nextAccessToken = refreshed.accessToken;
  apiClient.setTokenGetter(() => nextAccessToken);
  return nextAccessToken;
}

export default function RecordScreen() {
  const recordingRef = useRef<ActiveRecording | null>(null);
  const startingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState('');

  const stopRecorder = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;
    recordingRef.current = null;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      await setRecordingMode(false);
      return null;
    }
    await setRecordingMode(false);
    return recording.getURI();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (recordingPolicy.backgroundRecording) return;
      if (nextState === 'background' || nextState === 'inactive') {
        void stopRecorder();
      }
    });
    return () => subscription.remove();
  }, [stopRecorder]);

  async function beginRecording(): Promise<void> {
    if (recordingRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      const { Audio } = await import('expo-av');
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return;

      await setRecordingMode(true);
      const recording = new Audio.Recording();
      try {
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        recordingRef.current = recording;
        if (
          !recordingPolicy.backgroundRecording &&
          (AppState.currentState === 'background' || AppState.currentState === 'inactive')
        ) {
          await stopRecorder();
          return;
        }
        await recording.startAsync();
        setIsRecording(true);
        setMessage('');
      } catch {
        recordingRef.current = null;
        setIsRecording(false);
        await setRecordingMode(false);
      }
    } finally {
      startingRef.current = false;
    }
  }

  async function uploadTake(uri: string): Promise<void> {
    const FileSystem = await import('expo-file-system');
    const { apiClient } = await import('@unmute/api-client');
    const stamp = Date.now();
    const named = recordingUpload(stamp, uri);
    const destination = namedTakeUri(uri, named.name);
    if (destination !== uri) {
      await FileSystem.moveAsync({ from: uri, to: destination });
    }
    const upload = recordingUpload(stamp, destination);

    const token = await accessToken();
    if (!token) return;

    const task = FileSystem.createUploadTask(apiClient.getBaseUrl() + '/api/v1/sources', upload.uri, {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'audio/mp4',
      httpMethod: 'POST',
      sessionType: FileSystem.FileSystemSessionType[recordingPolicy.uploadSession],
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await task.uploadAsync();
    if (!result) return;
    if (result.status === 201) {
      setMessage('Sent to your inbox.');
      await FileSystem.deleteAsync(upload.uri, { idempotent: true });
      return;
    }
    if (result.status === 429) {
      setMessage('Too many requests. Try again later.');
    }
  }

  async function stopAndUpload(): Promise<void> {
    const uri = await stopRecorder();
    if (!uri) return;
    await uploadTake(uri);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.label}>{message}</Text>
      <TouchableOpacity
        style={styles.control}
        onPress={() => {
          if (isRecording) {
            void stopAndUpload();
            return;
          }
          void beginRecording();
        }}
        accessibilityRole="button"
      >
        <Text style={styles.label}>{isRecording ? 'Stop' : 'Record'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
    gap: 28,
  },
  control: {
    alignSelf: 'flex-start',
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  label: {
    color: '#f4f4f5',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '500',
  },
});
