# Demo audio library

This directory contains prebuilt, same-origin assets for the public demo. Vite
copies it to the deployed site as `/demo`, so the Rainy Tokyo mix is available
at `/demo/rainy-tokyo/mix.wav`.

The current app is static demo mode: it includes these audio files in the Vite
build and makes no backend or AI API requests. The on-screen labels, prompts,
and spatial positions live in `src/demo/rainyTokyo.ts`.

## Replace the scene

1. Replace the WAV files in `rainy-tokyo/` (or add a new URL-safe scene folder).
2. Update `src/demo/rainyTokyo.ts` to reference the new files and describe the
   individual stems.
3. Update `scenes.json` as a simple public catalog.
4. From `frontend/`, run `npm run build` before deploying.

MP3 is recommended for a smaller deployment. WAV works in modern browsers but
uses considerably more bandwidth. Only include audio you have permission to
distribute.
