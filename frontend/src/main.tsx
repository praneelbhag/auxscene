import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import SpatialEditor, { SpatialElement } from "./components/SpatialEditor/SpatialEditor";

// Test elements — replace individual_audio_url with real WAV paths once available.
// Place audio files in frontend/public/test-audio/ (e.g. rain.wav, footsteps.wav, chime.wav).
const TEST_ELEMENTS: SpatialElement[] = [
  {
    id: "test_1",
    label: "Rain",
    x: 0.0,
    y: 0.8,
    reverb: 0.4,
    individual_audio_url: "/test-audio/rain.wav",
  },
  {
    id: "test_2",
    label: "Footsteps",
    x: -0.3,
    y: 0.2,
    reverb: 0.1,
    individual_audio_url: "/test-audio/footsteps.wav",
  },
  {
    id: "test_3",
    label: "Wind Chime",
    x: 0.7,
    y: 0.5,
    reverb: 0.6,
    individual_audio_url: "/test-audio/chime.wav",
  },
];

function App() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">SoundScene</p>
        <h1>Spatial Audio Editor</h1>
      </section>
      <SpatialEditor elements={TEST_ELEMENTS} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
