export interface AudioNodes {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gainNode: GainNode;
  pannerNode: StereoPannerNode;
  reverbGain: GainNode;
  dryGain: GainNode;
  convolver: ConvolverNode;
  muteGain: GainNode;
}

let audioContext: AudioContext | null = null;
let sharedImpulse: AudioBuffer | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

function createImpulseResponse(ctx: AudioContext, duration = 2, decay = 2): AudioBuffer {
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function loadImpulseResponse(ctx: AudioContext): AudioBuffer {
  if (!sharedImpulse) {
    sharedImpulse = createImpulseResponse(ctx);
  }
  return sharedImpulse;
}

function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Could not load ${audio.src}`));
    };

    audio.addEventListener("loadedmetadata", handleLoaded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.load();
  });
}

export async function setupElement(element: {
  id: string;
  x: number;
  y: number;
  reverb: number;
  individual_audio_url: string;
}): Promise<AudioNodes> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const audio = new Audio(element.individual_audio_url);
  audio.crossOrigin = "anonymous";
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 1;

  await waitForMetadata(audio);

  const source = ctx.createMediaElementSource(audio);
  const gainNode = ctx.createGain();
  gainNode.gain.value = 1 - element.y * 0.55;

  const pannerNode = ctx.createStereoPanner();
  pannerNode.pan.value = element.x;

  const convolver = ctx.createConvolver();
  convolver.buffer = loadImpulseResponse(ctx);

  const reverbGain = ctx.createGain();
  reverbGain.gain.value = element.reverb;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - element.reverb * 0.5;

  const muteGain = ctx.createGain();
  muteGain.gain.value = 1;

  source.connect(gainNode);
  gainNode.connect(pannerNode);
  pannerNode.connect(muteGain);
  muteGain.connect(dryGain);
  dryGain.connect(ctx.destination);
  muteGain.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(ctx.destination);

  return { audio, source, gainNode, pannerNode, reverbGain, dryGain, convolver, muteGain };
}

export async function playElement(nodes: AudioNodes) {
  await resumeAudioContext();
  await nodes.audio.play();
}

export function pauseElement(nodes: AudioNodes) {
  nodes.audio.pause();
}

export function seekElement(nodes: AudioNodes, time: number) {
  if (!Number.isFinite(nodes.audio.duration) || nodes.audio.duration <= 0) return;
  nodes.audio.currentTime = Math.max(0, Math.min(nodes.audio.duration, time));
}

export function updateElementPosition(nodes: AudioNodes, newX: number, newY: number) {
  const ctx = getAudioContext();
  nodes.pannerNode.pan.setValueAtTime(newX, ctx.currentTime);
  const newGain = 1 - newY * 0.55;
  nodes.gainNode.gain.linearRampToValueAtTime(newGain, ctx.currentTime + 0.05);
}

export function updateElementReverb(nodes: AudioNodes, newReverb: number) {
  const ctx = getAudioContext();
  nodes.reverbGain.gain.linearRampToValueAtTime(newReverb, ctx.currentTime + 0.1);
  nodes.dryGain.gain.linearRampToValueAtTime(1 - newReverb * 0.5, ctx.currentTime + 0.1);
}

export function updateElementVolume(
  nodes: AudioNodes,
  volume: number,
  muted: boolean,
  solo: boolean,
  anySolo: boolean,
) {
  const ctx = getAudioContext();
  const effective = muted ? 0 : anySolo && !solo ? 0 : volume;
  nodes.muteGain.gain.linearRampToValueAtTime(effective, ctx.currentTime + 0.05);
}

export function teardownElement(nodes: AudioNodes) {
  nodes.audio.pause();
  nodes.audio.src = "";
  nodes.audio.load();

  try {
    nodes.source.disconnect();
    nodes.gainNode.disconnect();
    nodes.pannerNode.disconnect();
    nodes.muteGain.disconnect();
    nodes.dryGain.disconnect();
    nodes.convolver.disconnect();
    nodes.reverbGain.disconnect();
  } catch {
    // already disconnected
  }
}

export async function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx;
}
