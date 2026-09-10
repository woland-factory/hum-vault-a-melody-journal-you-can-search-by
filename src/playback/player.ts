import abcjs from "abcjs";

// Thin wrapper around the abcjs synth. The soundfont is self-hosted so playback
// does not depend on an external CDN and works on the deployed origin.

const SOUNDFONT_URL = "/soundfont/";

// The tune object returned by abcjs renderAbc(); its internal shape is private.
export type VisualObj = unknown;

export interface MelodyPlayer {
  play(visualObj: VisualObj): Promise<void>;
  stop(): void;
  dispose(): void;
}

function getAudioContextCtor(): typeof AudioContext {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("Audio playback is not supported in this browser.");
  return Ctor;
}

export function createPlayer(): MelodyPlayer {
  let audioContext: AudioContext | null = null;
  // abcjs synth instance; kept warm across replays of the same melody.
  let synth: InstanceType<typeof abcjs.synth.CreateSynth> | null = null;
  let primedFor: VisualObj | null = null;

  async function ensureContext(): Promise<AudioContext> {
    if (!audioContext) audioContext = new (getAudioContextCtor())();
    if (audioContext.state === "suspended") await audioContext.resume();
    return audioContext;
  }

  return {
    async play(visualObj: VisualObj): Promise<void> {
      if (!abcjs.synth.supportsAudio()) {
        throw new Error("Audio playback is not supported in this browser.");
      }
      const ctx = await ensureContext();

      if (primedFor !== visualObj || !synth) {
        synth?.stop();
        synth = new abcjs.synth.CreateSynth();
        await synth.init({
          audioContext: ctx,
          visualObj: visualObj as never,
          options: { soundFontUrl: SOUNDFONT_URL },
        });
        await synth.prime();
        primedFor = visualObj;
      } else {
        // Replay the same melody from the top.
        synth.stop();
        await synth.prime();
      }
      await synth.start();
    },

    stop(): void {
      synth?.stop();
    },

    dispose(): void {
      synth?.stop();
      synth = null;
      primedFor = null;
      if (audioContext) {
        void audioContext.close();
        audioContext = null;
      }
    },
  };
}
