export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Minimal text/event-stream parser over a fetch body. EventSource can't send an
 * Authorization header, and the access token must never go in a query string.
 */
export async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);

        if (line === '') {
          if (data.length > 0) {
            yield { event: event || 'message', data: data.join('\n') };
          }
          event = '';
          data = [];
          continue;
        }
        if (line.startsWith(':')) continue;

        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);

        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
