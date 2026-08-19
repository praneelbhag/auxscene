# Replace this directory with your scene

Rename this directory to the scene ID used in `scenes.json`, then add:

```text
mix.mp3
ambience.mp3
left-detail.mp3
close-detail.mp3
```

You may use different stem names as long as the corresponding
`individual_audio_url` values in `scenes.json` match them exactly.

An optional cover image can also live here. Reference it with a path such as
`/demo/your-scene/cover.jpg`; otherwise leave `image_url` as `null`.
