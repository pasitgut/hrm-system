export function bufferToReadableStream(
  buffer: Buffer | Uint8Array,
  chunkSize = 64 * 1024,
): ReadableStream<Uint8Array> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const nextOffset = Math.min(offset + chunkSize, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, nextOffset));
      offset = nextOffset;
    },
  });
}
