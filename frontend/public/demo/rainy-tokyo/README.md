# Rainy Tokyo demo assets

These WAVs are deployed with the site and are the only audio used by the demo.
They are copied from the repository's `generated/` folder; no API generates or
fetches audio at runtime.

To replace this demo, overwrite the WAV files here and update the matching
labels, prompts, and positions in `src/demo/rainyTokyo.ts`, then run
`npm run build` from `frontend/`.
