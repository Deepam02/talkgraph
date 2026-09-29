/**
 * Browser audio I/O for the Voice Agent API (PCM16 mono, 24 kHz, base64).
 *
 * Contexts run at the device's native rate and the worklets resample, which
 * AssemblyAI recommends: forcing 24 kHz breaks Firefox's echo canceller and is
 * silently ignored by Safari. Capture is batched into ~50 ms chunks; playback
 * uses a ring buffer so barge-in can empty it instantly.
 */
export const WIRE_RATE = 24_000;
const CHUNK_SAMPLES = 1200; // 50 ms at 24 kHz

const CAPTURE_WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${WIRE_RATE};
    this.pos = 0;
    this.prev = 0;
    this.buf = new Int16Array(${CHUNK_SAMPLES});
    this.len = 0;
  }
  push(v) {
    const s = Math.max(-1, Math.min(1, v));
    this.buf[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.len === this.buf.length) {
      const out = this.buf;
      this.port.postMessage(out.buffer, [out.buffer]);
      this.buf = new Int16Array(${CHUNK_SAMPLES});
      this.len = 0;
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.ratio === 1) {
      for (let i = 0; i < ch.length; i++) this.push(ch[i]);
      return true;
    }
    const n = ch.length;
    let pos = this.pos;
    while (pos < n) {
      const i = Math.floor(pos);
      const a = i === 0 ? this.prev : ch[i - 1];
      const b = ch[i];
      this.push(a + (b - a) * (pos - i));
      pos += this.ratio;
    }
    this.pos = pos - n;
    this.prev = ch[n - 1];
    return true;
  }
}
registerProcessor('tg-capture', CaptureProcessor);
`;

const PLAYBACK_WORKLET = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(sampleRate * 60);
    this.w = 0; this.r = 0; this.avail = 0;
    this.step = ${WIRE_RATE} / sampleRate;
    this.rsPos = 0; this.rsPrev = 0; this.drained = true;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') { this.w = this.r = this.avail = 0; this.rsPos = 0; this.rsPrev = 0; this.drained = true; return; }
      const pcm = new Int16Array(e.data);
      if (!pcm.length) return;
      if (this.drained) { this.rsPrev = 0; this.rsPos = 0; this.drained = false; }
      if (this.step === 1) { for (let i = 0; i < pcm.length; i++) this.put(pcm[i] / 32768); return; }
      const n = pcm.length;
      let pos = this.rsPos;
      while (pos < n) {
        const i = Math.floor(pos);
        const a = i === 0 ? this.rsPrev : pcm[i - 1] / 32768;
        const b = pcm[i] / 32768;
        this.put(a + (b - a) * (pos - i));
        pos += this.step;
      }
      this.rsPos = pos - n;
      this.rsPrev = pcm[n - 1] / 32768;
    };
  }
  put(v) {
    if (this.avail >= this.ring.length) return;
    this.ring[this.w] = v; this.w = (this.w + 1) % this.ring.length; this.avail++;
  }
  process(_, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    for (let i = 0; i < ch0.length; i++) {
      if (this.avail > 0) { ch0[i] = this.ring[this.r]; this.r = (this.r + 1) % this.ring.length; this.avail--; }
      else { ch0[i] = 0; this.drained = true; }
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    return true;
  }
}
registerProcessor('tg-playback', PlaybackProcessor);
`;

async function addWorklet(ctx: AudioContext, code: string) {
  const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(bin);
}

export function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export class AudioIO {
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private playback: AudioWorkletNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private mic: MediaStream | null = null;
  micAnalyser: AnalyserNode | null = null;
  outAnalyser: AnalyserNode | null = null;
  private muted = false;

  /** Must be called from a user gesture (click/keypress) so browsers allow audio. */
  async open(): Promise<void> {
    this.captureCtx = new AudioContext();
    this.playbackCtx = new AudioContext();
    await Promise.all([this.captureCtx.resume(), this.playbackCtx.resume()]);
    await Promise.all([addWorklet(this.playbackCtx, PLAYBACK_WORKLET), addWorklet(this.captureCtx, CAPTURE_WORKLET)]);
    this.playback = new AudioWorkletNode(this.playbackCtx, "tg-playback", { outputChannelCount: [2] });
    this.outAnalyser = this.playbackCtx.createAnalyser();
    this.outAnalyser.fftSize = 512;
    this.outAnalyser.smoothingTimeConstant = 0.7;
    this.playback.connect(this.outAnalyser).connect(this.playbackCtx.destination);
  }

  async startMic(onChunk: (b64: string) => void): Promise<void> {
    if (!this.captureCtx) throw new Error("Audio not opened");
    // Echo cancellation on (hands-free, no headphones), noise suppression off:
    // the server's voice focus already denoises and stacking hurts accuracy.
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true },
    });
    const src = this.captureCtx.createMediaStreamSource(this.mic);
    this.micAnalyser = this.captureCtx.createAnalyser();
    this.micAnalyser.fftSize = 512;
    this.micAnalyser.smoothingTimeConstant = 0.6;
    this.capture = new AudioWorkletNode(this.captureCtx, "tg-capture");
    this.capture.port.onmessage = ({ data }) => {
      if (!this.muted) onChunk(toBase64(data as ArrayBuffer));
    };
    src.connect(this.micAnalyser);
    src.connect(this.capture);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  play(b64: string) {
    const buf = fromBase64(b64);
    this.playback?.port.postMessage(buf, [buf]);
  }

  flush() {
    this.playback?.port.postMessage("flush");
  }

  close() {
    this.flush();
    this.capture?.port.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    void this.captureCtx?.close().catch(() => {});
    void this.playbackCtx?.close().catch(() => {});
    this.captureCtx = this.playbackCtx = null;
    this.playback = this.capture = null;
    this.mic = null;
    this.micAnalyser = this.outAnalyser = null;
  }
}

/** RMS level 0..1 from an analyser, for waveform rendering. */
export function level(an: AnalyserNode | null, scratch: Uint8Array<ArrayBuffer>): number {
  if (!an) return 0;
  an.getByteTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) {
    const v = (scratch[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / scratch.length) * 3.2);
}
