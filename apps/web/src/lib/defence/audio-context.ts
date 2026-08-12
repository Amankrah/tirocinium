// The browser half of the defence audio: microphone capture into 16 kHz mono
// PCM, and a Web Audio sink for the reply. Deliberately thin, because every
// rule worth testing lives in pcm.ts and playback.ts; this file is the glue
// jsdom cannot run, and the Playwright journey is what exercises it.
//
// It loads only inside the dynamically imported session module, so no content
// route carries a byte of it (guide 5).
import { type AudioSink, type PlayingSound } from "./playback";
import { PcmChunker, resample, SAMPLE_RATE } from "./pcm";

// The capture processor, registered from a blob rather than a file in /public,
// so the module stays self-contained. It only forwards frames; the conversion
// happens on the main thread where it is testable.
const CAPTURE_WORKLET = `
class TiroCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('tiro-capture', TiroCapture);
`;

export interface Microphone {
  stop(): void;
}

// Open the microphone and deliver 80 ms PCM chunks. Returns null when there is
// no microphone to open, whether the student refused it, the device has none,
// or the browser lacks the API: the surface treats all three the same way,
// because the student needs the same thing from each, which is the keyboard.
export async function openMicrophone(
  context: AudioContext,
  onChunk: (chunk: Int16Array) => void,
): Promise<Microphone | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    return null;
  }

  let worklet: AudioWorkletNode;
  let blobUrl: string | null = null;
  try {
    blobUrl = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET], { type: "application/javascript" }),
    );
    await context.audioWorklet.addModule(blobUrl);
    worklet = new AudioWorkletNode(context, "tiro-capture");
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }

  const chunker = new PcmChunker();
  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const samples = resample(event.data, context.sampleRate, SAMPLE_RATE);
    for (const chunk of chunker.push(samples)) onChunk(chunk);
  };

  const source = context.createMediaStreamSource(stream);
  // A worklet has to be in the rendering graph to run, but routing the
  // microphone to the speakers would echo, so it terminates in a silent gain.
  const silence = context.createGain();
  silence.gain.value = 0;
  source.connect(worklet);
  worklet.connect(silence);
  silence.connect(context.destination);

  return {
    stop() {
      worklet.port.onmessage = null;
      try {
        source.disconnect();
        worklet.disconnect();
        silence.disconnect();
      } catch {
        // A context already closed by teardown; nothing to unwind.
      }
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

export function webAudioSink(context: AudioContext): AudioSink {
  return {
    play(samples: Float32Array): PlayingSound {
      const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
      // set() rather than copyToChannel(), which insists on a Float32Array over
      // a plain ArrayBuffer and would force the seam's type to say so too.
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);

      let settle!: () => void;
      const finished = new Promise<void>((resolve) => {
        settle = resolve;
      });
      source.onended = () => settle();
      source.start();

      return {
        finished,
        stop() {
          try {
            source.stop();
          } catch {
            // Already finished; onended has settled the promise.
          }
          settle();
        },
      };
    },
  };
}
