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


LAYER_TARGET_RMS_DBFS = {
    "foreground": -21.0,
    "midground": -25.0,
    "background": -29.0,
}

LAYER_SCENE_GAIN = {
    "foreground": 0.85,
    "midground": 0.62,
    "background": 0.44,
}


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


def condition_for_natural_mix(audio: AudioTrack, layer: str | None) -> AudioTrack:
    layer_key = str(layer or "midground").lower()
    target_rms = _db_to_amplitude(LAYER_TARGET_RMS_DBFS.get(layer_key, -25.0))
    scene_gain = LAYER_SCENE_GAIN.get(layer_key, 0.62)

    samples = np.nan_to_num(audio.samples.copy(), copy=False)
    samples = _apply_short_fades(samples, audio.sample_rate)
    samples = _reduce_if_louder_than_rms(samples, target_rms)
    samples *= scene_gain
    samples = _cap_peak(samples, peak=0.86)

    return AudioTrack(samples=samples.astype(np.float32), sample_rate=audio.sample_rate)


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

    mix = _reduce_if_louder_than_rms(mix, _db_to_amplitude(-20.0))
    mix = _cap_peak(mix, peak=0.92)
    mix = _soft_limit(mix)

    return AudioTrack(samples=np.clip(mix, -1.0, 1.0), sample_rate=sample_rate)


def export_wav(audio: AudioTrack, path: Path) -> None:
    samples = np.clip(audio.samples, -1.0, 1.0)
    pcm = (samples.T.reshape(-1) * 32767.0).astype("<i2")

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(samples.shape[0])
        wav_file.setsampwidth(2)
        wav_file.setframerate(audio.sample_rate)
        wav_file.writeframes(pcm.tobytes())


def _db_to_amplitude(dbfs: float) -> float:
    return 10 ** (dbfs / 20.0)


def _rms(samples: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0


def _reduce_if_louder_than_rms(samples: np.ndarray, target_rms: float) -> np.ndarray:
    current_rms = _rms(samples)
    if current_rms <= target_rms or current_rms <= 1e-6:
        return samples
    return samples * (target_rms / current_rms)


def _cap_peak(samples: np.ndarray, *, peak: float) -> np.ndarray:
    current_peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if current_peak <= peak or current_peak <= 1e-6:
        return samples
    return samples * (peak / current_peak)


def _apply_short_fades(samples: np.ndarray, sample_rate: int, fade_ms: float = 35.0) -> np.ndarray:
    fade_samples = min(samples.shape[1] // 2, max(1, int(sample_rate * fade_ms / 1000.0)))
    if fade_samples <= 1:
        return samples

    curve = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
    samples[:, :fade_samples] *= curve
    samples[:, -fade_samples:] *= curve[::-1]
    return samples


def _soft_limit(samples: np.ndarray, drive: float = 1.35) -> np.ndarray:
    return np.tanh(samples * drive) / np.tanh(drive)
