export interface AudioNodes {
  source: AudioBufferSourceNode;
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
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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

  const response = await fetch(element.individual_audio_url);
  if (!response.ok) {
    throw new Error(`Could not load ${element.individual_audio_url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 1 - element.y * 0.85;

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

  // Chain: source → gain → panner → muteGain → dry/wet split → destination
  source.connect(gainNode);
  gainNode.connect(pannerNode);
  pannerNode.connect(muteGain);

  // Dry path
  muteGain.connect(dryGain);
  dryGain.connect(ctx.destination);

  // Wet/reverb path
  muteGain.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(ctx.destination);

  source.start(0);

  return { source, gainNode, pannerNode, reverbGain, dryGain, convolver, muteGain };
}

export function updateElementPosition(nodes: AudioNodes, newX: number, newY: number) {
  const ctx = getAudioContext();
  nodes.pannerNode.pan.setValueAtTime(newX, ctx.currentTime);
  const newGain = 1 - newY * 0.85;
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
  anySolo: boolean
) {
  const ctx = getAudioContext();
  const effective = muted ? 0 : anySolo && !solo ? 0 : volume;
  nodes.muteGain.gain.linearRampToValueAtTime(effective, ctx.currentTime + 0.05);
}

export function teardownElement(nodes: AudioNodes) {
  try {
    nodes.source.stop();
    nodes.source.disconnect();
    nodes.gainNode.disconnect();
    nodes.pannerNode.disconnect();
    nodes.muteGain.disconnect();
    nodes.dryGain.disconnect();
    nodes.convolver.disconnect();
    nodes.reverbGain.disconnect();
  } catch {
    // already stopped
  }
}

export async function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx;
}
