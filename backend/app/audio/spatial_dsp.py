from dataclasses import dataclass
from math import gcd
from pathlib import Path
import wave

import numpy as np
from pedalboard import LowpassFilter, Pedalboard, Reverb
from scipy.signal import resample_poly


@dataclass
class AudioTrack:
    samples: np.ndarray
    sample_rate: int


def audio_bytes_to_audio_track(audio_bytes: bytes, output_format: str) -> AudioTrack:
    if output_format.startswith("pcm_"):
        sample_rate = int(output_format.split("_", maxsplit=1)[1])
        samples = np.frombuffer(audio_bytes, dtype="<i2").astype(np.float32) / 32768.0
        return AudioTrack(samples=samples.reshape(1, -1), sample_rate=sample_rate)

    if output_format.startswith("mp3_"):
        raise ValueError("MP3 decoding requires FFmpeg. Use ELEVENLABS_OUTPUT_FORMAT=pcm_24000.")

    raise ValueError(f"Unsupported ElevenLabs output format: {output_format}")


def enforce_duration(audio: AudioTrack, duration_seconds: float) -> AudioTrack:
    target_samples = int(duration_seconds * audio.sample_rate)
    current_samples = audio.samples.shape[1]

    if current_samples > target_samples:
        return AudioTrack(samples=audio.samples[:, :target_samples], sample_rate=audio.sample_rate)

    if current_samples < target_samples:
        pad_width = target_samples - current_samples
        samples = np.pad(audio.samples, ((0, 0), (0, pad_width)), mode="constant")
        return AudioTrack(samples=samples, sample_rate=audio.sample_rate)

    return audio


def normalize_for_mix(audio: AudioTrack, sample_rate: int, channels: int) -> AudioTrack:
    samples = audio.samples

    if audio.sample_rate != sample_rate:
        divisor = gcd(audio.sample_rate, sample_rate)
        samples = resample_poly(samples, sample_rate // divisor, audio.sample_rate // divisor, axis=1)

    if channels == 1 and samples.shape[0] > 1:
        samples = samples.mean(axis=0, keepdims=True)
    elif channels == 2 and samples.shape[0] == 1:
        samples = np.repeat(samples, 2, axis=0)
    elif samples.shape[0] != channels:
        samples = samples[:channels]

    return AudioTrack(samples=samples.astype(np.float32), sample_rate=sample_rate)


def apply_spatial(audio: AudioTrack, x: float, y: float, reverb_amount: float) -> AudioTrack:
    attenuation = 10 ** ((-y * 20.0) / 20.0)
    samples = audio.samples * attenuation

    if samples.shape[0] == 1:
        samples = np.repeat(samples, 2, axis=0)

    board = Pedalboard(
        [
            LowpassFilter(cutoff_frequency_hz=max(300.0, 20000.0 - (y * 15000.0))),
            Reverb(
                room_size=min(1.0, reverb_amount * 0.8),
                wet_level=min(1.0, reverb_amount),
                dry_level=max(0.0, 1.0 - (reverb_amount * 0.3)),
            ),
        ]
    )
    processed = board(samples, sample_rate=audio.sample_rate)

    left_gain = np.sqrt((1.0 - x) / 2.0)
    right_gain = np.sqrt((1.0 + x) / 2.0)
    processed[0] *= left_gain
    processed[1] *= right_gain

    return AudioTrack(samples=np.clip(processed, -1.0, 1.0).astype(np.float32), sample_rate=audio.sample_rate)


def mix_all(processed_tracks: list[AudioTrack], duration_seconds: float, sample_rate: int) -> AudioTrack:
    target_samples = int(duration_seconds * sample_rate)
    mix = np.zeros((2, target_samples), dtype=np.float32)

    for track in processed_tracks:
        samples = track.samples
        if track.sample_rate != sample_rate:
            samples = normalize_for_mix(track, sample_rate, 2).samples
        samples = samples[:, :target_samples]
        if samples.shape[1] < target_samples:
            samples = np.pad(samples, ((0, 0), (0, target_samples - samples.shape[1])), mode="constant")
        mix += samples

    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > 1.0:
        mix /= peak

    return AudioTrack(samples=np.clip(mix, -1.0, 1.0), sample_rate=sample_rate)


def export_wav(audio: AudioTrack, path: Path) -> None:
    samples = np.clip(audio.samples, -1.0, 1.0)
    pcm = (samples.T.reshape(-1) * 32767.0).astype("<i2")

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(samples.shape[0])
        wav_file.setsampwidth(2)
        wav_file.setframerate(audio.sample_rate)
        wav_file.writeframes(pcm.tobytes())
