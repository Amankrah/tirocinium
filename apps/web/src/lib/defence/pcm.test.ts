import { describe, expect, it } from "vitest";

import {
  CHUNK_SAMPLES,
  floatToPcm16,
  pcm16ToFloat,
  PcmChunker,
  resample,
} from "./pcm";

describe("PCM conversion", () => {
  it("maps the rails without wrapping", () => {
    const out = floatToPcm16(new Float32Array([0, 1, -1]));
    expect(Array.from(out)).toEqual([0, 32767, -32768]);
  });

  it("saturates rather than inverting a sample over the rail", () => {
    const out = floatToPcm16(new Float32Array([2, -2]));
    expect(Array.from(out)).toEqual([32767, -32768]);
  });

  it("round-trips through the wire format within a quantization step", () => {
    const source = new Float32Array([0, 0.25, -0.5, 0.75, -0.125]);
    const back = pcm16ToFloat(floatToPcm16(source).buffer as ArrayBuffer);
    expect(back.length).toBe(source.length);
    for (let i = 0; i < source.length; i += 1) {
      expect(Math.abs((back[i] ?? 0) - (source[i] ?? 0))).toBeLessThan(1 / 32767);
    }
  });

  it("reads incoming bytes as little-endian signed samples", () => {
    // 0x0100 little-endian is 1; 0xFFFF is -1.
    const bytes = new Uint8Array([0x01, 0x00, 0xff, 0xff]);
    const out = pcm16ToFloat(bytes.buffer);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(1 / 32767, 6);
    expect(out[1]).toBeCloseTo(-1 / 32768, 6);
  });
});

describe("resampling to the wire rate", () => {
  it("returns the same samples when the rates match", () => {
    const source = new Float32Array([0.1, 0.2, 0.3]);
    expect(resample(source, 16_000, 16_000)).toBe(source);
  });

  it("thins a 48 kHz buffer to a third of its length", () => {
    const source = new Float32Array(480).fill(0.5);
    const out = resample(source, 48_000, 16_000);
    expect(out.length).toBe(160);
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[159]).toBeCloseTo(0.5, 6);
  });

  it("interpolates between neighbours rather than dropping to the nearest", () => {
    const source = new Float32Array([0, 1, 0, 1]);
    const out = resample(source, 32_000, 16_000);
    expect(Array.from(out)).toEqual([0, 0]);
  });
});

describe("PcmChunker", () => {
  it("emits whole 80 ms chunks only and keeps the remainder", () => {
    const chunker = new PcmChunker();
    expect(chunker.push(new Float32Array(CHUNK_SAMPLES - 1))).toHaveLength(0);
    const chunks = chunker.push(new Float32Array(2));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.length).toBe(CHUNK_SAMPLES);
  });

  it("emits several chunks from one oversized buffer", () => {
    const chunker = new PcmChunker();
    const chunks = chunker.push(new Float32Array(CHUNK_SAMPLES * 3 + 7));
    expect(chunks).toHaveLength(3);
    expect(chunker.flush()?.length).toBe(7);
  });

  it("loses no samples across pushes", () => {
    const chunker = new PcmChunker(4);
    const source = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => n / 10));
    const emitted: number[] = [];
    for (const value of source) {
      for (const chunk of chunker.push(new Float32Array([value]))) {
        emitted.push(...Array.from(chunk));
      }
    }
    const tail = chunker.flush();
    if (tail) emitted.push(...Array.from(tail));
    expect(emitted).toHaveLength(source.length);
    expect(emitted[0]).toBe(floatToPcm16(new Float32Array([0.1]))[0]);
  });

  it("flushes to null once emptied", () => {
    const chunker = new PcmChunker(4);
    chunker.push(new Float32Array(4));
    expect(chunker.flush()).toBeNull();
  });
});
