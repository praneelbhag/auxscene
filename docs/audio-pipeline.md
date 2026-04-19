# SoundScene Audio Pipeline

This pipeline keeps the current Gemini + ElevenLabs + deterministic DSP architecture, but shifts the system from "generate several sounds and sum them" to a WavJourney-style composition plan.

## Why This Path

Research systems like WavJourney use an LLM to write an interpretable audio script, then execute that script with generation and mixing tools. Soundify points to the same practical idea for spatial sound: maintain ambient beds separately from effects, then compute pan and gain. That fits SoundScene better than trying to fine-tune an audio model during a hackathon.

AudioLDM 2 is useful to know about because it can generate or re-synthesize broader soundscapes, but it is not the safest core dependency right now. It can be explored later as an optional polish pass after our deterministic mix works.

## Chosen Architecture

1. Decompose the user prompt into 3-6 concrete sound elements.
2. Add an acoustic context pass that rewrites each element in context of the full scene.
3. Attach script-like mix metadata to each element:
   - `start_seconds`
   - `duration_seconds`
   - `gain_db`
   - `density`
   - `role`
   - `high_cut_hz`
   - `low_cut_hz`
   - `duck_background`
4. Generate each element independently with ElevenLabs Sound Effects.
5. Condition each stem before spatialization:
   - trim or pad to its scripted duration
   - apply fades
   - apply layer gain
   - apply mix gain
   - apply high/low cut defaults
6. Mix on a timeline rather than assuming every element starts at `0`.
7. Duck background beds under foreground events.
8. Apply final naturalness guardrails:
   - conservative RMS target
   - peak headroom
   - soft limiting
9. Cache only accepted final stems.
10. Let the spatial editor regenerate individual stems with user edits.

## Reviewer Role

The Gemini audio reviewer answers "does this stem sound like the intended prompt and is it comfortable?" It does not replace audio engineering. The deterministic DSP layer answers "does this sit naturally in the scene?"

Reviewer output is useful for:
- wrong sound family
- unwanted speech or music
- harsh or overly dense generated sound
- suggested prompt for one retry

DSP output is useful for:
- loudness
- one element dominating
- harsh high frequencies
- abrupt starts and ends
- scene-level sensory overload

## Mix Defaults

Background:
- continuous or sparse bed
- lower gain
- more distance
- high frequency rolloff
- eligible for ducking

Midground:
- moderate gain
- light reverb
- occasional or sparse density

Foreground:
- shorter one-shot or sparse event
- clearer transient
- less reverb
- can trigger background ducking

## Optional Later Upgrade

Add a neural polish stage behind a feature flag:

1. Export the deterministic mixed WAV.
2. Send it to an audio-to-audio model such as AudioLDM 2 with a style prompt like "cohesive natural outdoor ambience, realistic acoustic space, gentle balanced mix."
3. Review the polished result.
4. Keep it only if it improves score and does not introduce artifacts.

This should remain optional because neural re-synthesis can blur precise sound sources or introduce unexpected content.
