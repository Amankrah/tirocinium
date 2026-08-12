// The audio format arithmetic for the defence stream: mono 16 kHz 16-bit PCM in
// both directions, 80 ms per outbound chunk, which is what the recognizer wants
// (the backend handoff). Pure functions and one accumulator, so the conversion
// is tested without a browser; the Web Audio glue that feeds them lives in
// microphone.ts and playback.ts.

// 80 ms at 16 kHz.
export const SAMPLE_RATE = 16_000;
export const CHUNK_SAMPLES = 1_280;

// Float samples in -1..1 to signed 16-bit. Clamped rather than wrapped, because
// a sample over the rail should saturate, not invert.
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = Math.round(clamped * (clamped < 0 ? 0x8000 : 0x7fff));
  }
  return out;
}

// Signed 16-bit little-endian bytes back to float samples, for playback.
export function pcm16ToFloat(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const count = Math.floor(buffer.byteLength / 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const value = view.getInt16(i * 2, true);
    out[i] = value / (value < 0 ? 0x8000 : 0x7fff);
  }
  return out;
}

// Linear resampling to the wire rate. Browsers hand us whatever the hardware
// context runs at (often 44.1 or 48 kHz), and the recognizer wants 16 kHz.
export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const count = Math.floor(samples.length / ratio);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const position = i * ratio;
    const low = Math.floor(position);
    const high = Math.min(low + 1, samples.length - 1);
    const fraction = position - low;
    out[i] = (samples[low] ?? 0) * (1 - fraction) + (samples[high] ?? 0) * fraction;
  }
  return out;
}

// Accumulates captured samples and emits whole chunks only, so the socket
// carries an even 80 ms every time regardless of the buffer size the browser
// hands us.
export class PcmChunker {
  private pending: Float32Array = new Float32Array(0);

  constructor(private readonly chunkSamples: number = CHUNK_SAMPLES) {}

  push(samples: Float32Array): Int16Array[] {
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending, 0);
    merged.set(samples, this.pending.length);

    const chunks: Int16Array[] = [];
    let offset = 0;
    while (merged.length - offset >= this.chunkSamples) {
      chunks.push(
        floatToPcm16(merged.subarray(offset, offset + this.chunkSamples)),
      );
      offset += this.chunkSamples;
    }
    this.pending = merged.slice(offset);
    return chunks;
  }

  // Whatever is left, short of a whole chunk. Used when a turn ends.
  flush(): Int16Array | null {
    if (this.pending.length === 0) return null;
    const remainder = floatToPcm16(this.pending);
    this.pending = new Float32Array(0);
    return remainder;
  }
}
