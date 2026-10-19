export function recordingUpload(stamp: number, uri: string): { uri: string; name: string; type: string } {
  return {
    uri,
    name: `capture-${stamp}.m4a`,
    type: 'audio/mp4',
  };
}

export const recordingPolicy = { backgroundRecording: false, uploadSession: 'BACKGROUND' } as const;
