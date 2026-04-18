# Person 4 — Spatial Editor + Real-Time Web Audio

## Your Role

You build the "jaw-drop moment" — the interactive 2D spatial editor where users drag sound elements around and hear them move in real time. This is the single most impressive demo moment in the project. A judge puts on headphones, drags a dot from left to right, and hears the sound cross. That's your deliverable.

---

## What You're Building

A React component: `<SpatialEditor />`

**Props received from Person 3:**
```javascript
<SpatialEditor
  elements={[
    {
      id: "elem_1",
      label: "Heavy Rain",
      x: 0.0,        // -1 to 1 (left to right)
      y: 0.8,        // 0 to 1 (close to far)
      reverb: 0.4,   // 0 to 1
      individual_audio_url: "/static/outputs/elem_1_abc123.wav"
    },
    {
      id: "elem_2",
      label: "Footsteps",
      x: -0.3,
      y: 0.15,
      reverb: 0.1,
      individual_audio_url: "/static/outputs/elem_2_abc123.wav"
    }
  ]}
/>
```

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌───────────────────────────────┐  ┌────────────────┐  │
│  │                               │  │  Element List   │  │
│  │        2D SPATIAL MAP         │  │                │  │
│  │                               │  │  🔵 Heavy Rain  │  │
│  │    🔵 Rain                    │  │    Reverb: ━━━  │  │
│  │                               │  │    Vol: ━━━━━   │  │
│  │              🎧               │  │    [Solo] [Mute]│  │
│  │           (listener)          │  │                │  │
│  │                               │  │  🟢 Footsteps   │  │
│  │        🟢 Footsteps           │  │    Reverb: ━━━  │  │
│  │                               │  │    Vol: ━━━━━   │  │
│  │                               │  │    [Solo] [Mute]│  │
│  │                               │  │                │  │
│  └───────────────────────────────┘  │  [🎧 Headphone] │  │
│                                      └────────────────┘  │
│  [▶ Play All] [⏸ Pause] [🔄 Reset Positions]            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**2D Map:**
- Rectangular area, dark background, subtle grid
- Listener icon fixed at center (headphone emoji or custom icon)
- Each element is a colored, labeled dot
- Dots are draggable — drag fires real-time audio updates
- Distance rings (concentric circles) at 25%, 50%, 75% of max distance for visual reference

**Sidebar:**
- List of all elements with:
  - Color-coded dot matching the map
  - Label
  - Reverb slider (0 to 1)
  - Volume override slider
  - Solo/Mute toggles

**Controls:**
- Play All / Pause (all elements loop simultaneously)
- Reset Positions (snap back to original x, y values)
- Headphone mode toggle (shows a reminder to use headphones)

---

## Web Audio API Architecture

This is the core technical work. Each element gets its own audio processing chain.

```
AudioBufferSource → GainNode → StereoPannerNode → ConvolverNode (reverb) → Destination
                                                                            ↑
                                                    Dry path ───────────────┘
```

### Setup (on mount / on play)

```javascript
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// For each element:
async function setupElement(element) {
  // 1. Fetch and decode audio
  const response = await fetch(element.individual_audio_url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // 2. Create source (looping)
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;

  // 3. Create gain node (volume from distance)
  const gainNode = audioContext.createGain();
  const distance = element.y; // 0 (close/loud) to 1 (far/quiet)
  gainNode.gain.value = 1 - (distance * 0.85); // never fully silent

  // 4. Create panner
  const pannerNode = audioContext.createStereoPanner();
  pannerNode.pan.value = element.x; // -1 to 1

  // 5. Create reverb (convolver)
  const convolver = audioContext.createConvolver();
  convolver.buffer = await loadImpulseResponse(); // load once, share
  const reverbGain = audioContext.createGain();
  reverbGain.gain.value = element.reverb;
  const dryGain = audioContext.createGain();
  dryGain.gain.value = 1 - element.reverb * 0.5;

  // 6. Connect the chain
  source.connect(gainNode);
  gainNode.connect(pannerNode);

  // Dry path
  pannerNode.connect(dryGain);
  dryGain.connect(audioContext.destination);

  // Wet path (reverb)
  pannerNode.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(audioContext.destination);

  // 7. Start
  source.start(0);

  return { source, gainNode, pannerNode, reverbGain, dryGain, convolver };
}
```

### Real-Time Updates (on drag)

When a dot is dragged, update the audio nodes immediately:

```javascript
function updateElementPosition(nodes, newX, newY) {
  // Update pan (instant)
  nodes.pannerNode.pan.setValueAtTime(newX, audioContext.currentTime);

  // Update volume from distance (smooth ramp to avoid clicks)
  const newGain = 1 - (newY * 0.85);
  nodes.gainNode.gain.linearRampToValueAtTime(newGain, audioContext.currentTime + 0.05);
}

function updateElementReverb(nodes, newReverb) {
  nodes.reverbGain.gain.linearRampToValueAtTime(newReverb, audioContext.currentTime + 0.1);
  nodes.dryGain.gain.linearRampToValueAtTime(1 - newReverb * 0.5, audioContext.currentTime + 0.1);
}
```

**Critical:** Use `linearRampToValueAtTime` or `setTargetAtTime` for smooth transitions. Never set `.value` directly during playback — it causes clicks and pops.

### Impulse Response for Reverb

You need a short impulse response WAV for the ConvolverNode. Options:
- Generate one algorithmically (noise decay)
- Use a free IR from OpenAir or similar
- Synthesize a simple one:

```javascript
function createImpulseResponse(duration = 2, decay = 2) {
  const length = audioContext.sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}
```

---

## Dragging Implementation

Use pointer events for smooth cross-device dragging:

```javascript
function DraggableDot({ element, onDrag }) {
  const [isDragging, setIsDragging] = useState(false);
  const mapRef = useRef(null); // reference to the map container

  const handlePointerDown = (e) => {
    e.target.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const rect = mapRef.current.getBoundingClientRect();

    // Convert pixel position to normalized coordinates
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    // Map to x: [-1, 1], y: [0, 1]
    const x = ((pixelX / rect.width) * 2) - 1;
    const y = pixelY / rect.height;

    // Clamp
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));

    onDrag(element.id, clampedX, clampedY);
  };

  const handlePointerUp = () => setIsDragging(false);

  // Convert normalized coords to pixel position for rendering
  const left = ((element.x + 1) / 2) * 100 + "%";
  const top = (element.y * 100) + "%";

  return (
    <div
      className="draggable-dot"
      style={{ left, top, background: element.color }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span className="dot-label">{element.label}</span>
    </div>
  );
}
```

---

## File Structure

```
frontend/src/
  components/
    SpatialEditor/
      SpatialEditor.jsx      # Main component (exported to Person 3)
      SpatialMap.jsx          # The 2D map with draggable dots
      DraggableDot.jsx        # Individual draggable element
      ElementSidebar.jsx      # Sidebar with reverb/volume/solo/mute
      AudioEngine.js          # Web Audio API setup and update functions
      SpatialEditor.css       # Styles
```

---

## State Management

```javascript
function SpatialEditor({ elements: initialElements }) {
  const [elements, setElements] = useState(
    initialElements.map((el, i) => ({
      ...el,
      color: COLORS[i % COLORS.length],
      muted: false,
      solo: false,
      volumeOverride: 1.0,
    }))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const audioNodesRef = useRef({}); // { elem_1: { source, gainNode, pannerNode, ... } }

  const handleDrag = (id, newX, newY) => {
    setElements(prev => prev.map(el =>
      el.id === id ? { ...el, x: newX, y: newY } : el
    ));
    // Update Web Audio nodes in real time
    if (audioNodesRef.current[id]) {
      updateElementPosition(audioNodesRef.current[id], newX, newY);
    }
  };

  const handleReverbChange = (id, newReverb) => {
    setElements(prev => prev.map(el =>
      el.id === id ? { ...el, reverb: newReverb } : el
    ));
    if (audioNodesRef.current[id]) {
      updateElementReverb(audioNodesRef.current[id], newReverb);
    }
  };

  // ... play, pause, mute, solo handlers
}
```

---

## Integration Contract

- **From Person 2:** Individual audio WAV files per element, accessible at the URLs in `individual_audio_url`.
- **From Person 3:** Your `<SpatialEditor />` component is imported and rendered with the element data as props. Export it as the default export.
- **No backend dependency.** Everything runs client-side in the browser via Web Audio API.

---

## Testing Without Other People

You don't need anyone else to develop this. Use test audio files:

```javascript
const TEST_ELEMENTS = [
  {
    id: "test_1",
    label: "Rain",
    x: 0.0,
    y: 0.8,
    reverb: 0.4,
    individual_audio_url: "/test-audio/rain.wav"
  },
  {
    id: "test_2",
    label: "Footsteps",
    x: -0.3,
    y: 0.2,
    reverb: 0.1,
    individual_audio_url: "/test-audio/footsteps.wav"
  },
  {
    id: "test_3",
    label: "Wind Chime",
    x: 0.7,
    y: 0.5,
    reverb: 0.6,
    individual_audio_url: "/test-audio/chime.wav"
  }
];
```

Get free test audio from:
- freesound.org (search "rain loop", "footsteps loop", etc.)
- Any short WAV/MP3 files you have

**Test checklist:**
- [ ] Put on headphones
- [ ] Play all elements
- [ ] Drag rain dot from center to hard right — hear it pan right
- [ ] Drag footsteps dot away from center (increase y) — hear it get quieter
- [ ] Crank reverb slider on wind chime — hear it get spacious
- [ ] Mute individual elements — only muted ones go silent
- [ ] Solo an element — only that one plays
- [ ] Reset positions — everything snaps back and audio updates
- [ ] No clicks or pops during any drag operation

---

## Visual Design Notes

Match Person 3's dark theme:
- Map background: `#0d0d14` with subtle grid lines at `#1a1a2e`
- Distance rings: concentric circles, very subtle, `#1a1a2e` stroke
- Listener icon: centered, slightly glowing, headphone emoji or custom SVG
- Dots: 20-24px diameter, distinct colors per element, slight glow/shadow
- Labels: small, white, positioned just below each dot
- Active/dragging dot: slightly larger, brighter glow
- Sidebar: `#111118` background, clean sliders

---

## Advanced (If Time Permits)

- **HRTF panning:** Replace `StereoPannerNode` with `PannerNode` set to HRTF mode for true 3D audio. Use `positionX`, `positionY`, `positionZ` instead of stereo pan.
- **Distance model:** Use `PannerNode.distanceModel = 'inverse'` for physically accurate distance attenuation.
- **Per-element EQ:** Add a `BiquadFilterNode` for low-pass filtering on distant sources (high y = more high-frequency rolloff).
- **Waveform visualization:** Use `AnalyserNode` per element to show a mini waveform on each dot.
