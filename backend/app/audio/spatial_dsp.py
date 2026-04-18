from io import BytesIO

import numpy as np
from pedalboard import LowpassFilter, Pedalboard, Reverb
from pydub import AudioSegment


def mp3_bytes_to_audio_segment(mp3_bytes: bytes) -> AudioSegment:
    return AudioSegment.from_file(BytesIO(mp3_bytes), format="mp3")


def enforce_duration(audio: AudioSegment, duration_seconds: float) -> AudioSegment:
    target_ms = int(duration_seconds * 1000)
    if len(audio) > target_ms:
        return audio[:target_ms]
    if len(audio) < target_ms:
        return audio + AudioSegment.silent(duration=target_ms - len(audio))
    return audio


def normalize_for_mix(audio: AudioSegment, sample_rate: int, channels: int) -> AudioSegment:
    return audio.set_frame_rate(sample_rate).set_sample_width(2).set_channels(channels)


def apply_spatial(audio_segment: AudioSegment, x: float, y: float, reverb_amount: float) -> AudioSegment:
    volume_db = -y * 20.0
    audio = audio_segment + volume_db

    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    samples = samples / (2**15)

    if audio.channels == 1:
        samples = np.stack([samples, samples])
    else:
        samples = samples.reshape((-1, 2)).T

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
    processed = board(samples, sample_rate=audio.frame_rate)

    left_gain = np.sqrt((1.0 - x) / 2.0)
    right_gain = np.sqrt((1.0 + x) / 2.0)
    processed[0] *= left_gain
    processed[1] *= right_gain

    processed = np.clip(processed, -1.0, 1.0)
    processed_pcm = (processed * (2**15 - 1)).astype(np.int16)
    processed_interleaved = processed_pcm.T.flatten()

    return AudioSegment(
        data=processed_interleaved.tobytes(),
        sample_width=2,
        frame_rate=audio.frame_rate,
        channels=2,
    )


def mix_all(processed_tracks: list[AudioSegment], duration_seconds: float, sample_rate: int) -> AudioSegment:
    base = AudioSegment.silent(duration=int(duration_seconds * 1000), frame_rate=sample_rate).set_channels(2)
    for track in processed_tracks:
        base = base.overlay(track)
    return base
