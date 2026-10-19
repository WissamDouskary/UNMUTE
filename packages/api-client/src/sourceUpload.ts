export interface SourceFileUpload {
  uri: string;
  name: string;
  type: string;
}

export function sourceFilePart(file: SourceFileUpload): { uri: string; name: string; type: string } {
  return { uri: file.uri, name: file.name, type: file.type };
}
