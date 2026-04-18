import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">SoundScene</p>
        <h1>Turn a scene into spatial sound.</h1>
        <p>
          Backend target: <code>{apiBaseUrl}</code>
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
