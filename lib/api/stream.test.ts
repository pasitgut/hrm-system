import { describe, expect, it } from "vitest";
import { bufferToReadableStream } from "@/lib/api/stream";

describe("bufferToReadableStream", () => {
  it("streams all bytes intact across multiple chunks", async () => {
    const source = Buffer.alloc(200 * 1024);
    for (let i = 0; i < source.length; i += 1) {
      source[i] = i % 251;
    }

    const stream = bufferToReadableStream(source, 32 * 1024);
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }

    expect(parts.length).toBe(7);
    const reconstructed = Buffer.concat(parts);
    expect(reconstructed.equals(source)).toBe(true);
  });
});
