import { useEffect, useRef, useState } from "react";

type AudioPlayerProps = {
  audioUrl: string;
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
};

export function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = "metadata";
    audio.volume = 0.8;
    audioRef.current = audio;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration || 0);
    const stopPlayback = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", stopPlayback);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", stopPlayback);
      audioRef.current = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seek = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(duration, nextTime));
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="audio-player">
      <button
        aria-label={isPlaying ? "Pause scene audio" : "Play scene audio"}
        className="play-button"
        onClick={togglePlay}
        type="button"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="audio-timeline">
        <input
          aria-label="Seek audio"
          className="progress-bar"
          disabled={!duration}
          max={duration || 0}
          min={0}
          onChange={(event) => seek(Number(event.target.value))}
          step={0.01}
          type="range"
          value={Math.min(currentTime, duration || 0)}
        />
        <span>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <label className="volume-control">
        <VolumeIcon />
        <input
          aria-label="Volume"
          max={1}
          min={0}
          onChange={(event) => setVolume(Number(event.target.value))}
          step={0.01}
          type="range"
          value={volume}
        />
      </label>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5.6v12.8L18.4 12 8 5.6Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Zm11.8 1.1a2.7 2.7 0 0 1 0 2.8l1.4 1a4.5 4.5 0 0 0 0-4.8l-1.4 1Z" />
    </svg>
  );
}
