// Decode a recorded Blob, downmix to mono, and resample to 22050 Hz, the input
// basic-pitch expects. The downmix and resample both happen inside a single
// OfflineAudioContext rendered at the target rate.

export const TARGET_SAMPLE_RATE = 22_050;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is not available in this browser.");
  return Ctor;
}

export async function decodeToMono22050(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error("The recording was empty.");
  }

  const Ctor = getAudioContextCtor();
  const decodeCtx = new Ctor();
  let decoded: AudioBuffer;
  try {
    // slice(0) to hand decodeAudioData its own detachable copy.
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    void decodeCtx.close();
  }

  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}
