"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface AudioRecordingPlayerProps {
  recordingUrl: string;
  durationSeconds?: number;
}

export function AudioRecordingPlayer({
  recordingUrl,
  durationSeconds = 0,
}: AudioRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch((err) => {
        console.warn("Audio playback error:", err);
      });
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audio) {
      audio.currentTime = newTime;
    }
  }

  function cycleSpeed() {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIdx];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  }

  function toggleMute() {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }

  const effectiveDuration = duration > 0 ? duration : durationSeconds;
  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  return (
    <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl border border-emerald-500/20 shadow-xs max-w-xs">
      <audio ref={audioRef} src={recordingUrl} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 transition"
        title={isPlaying ? "Pause Recording" : "Play Recording"}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>

      {/* Scrubber and Time */}
      <div className="flex-1 min-w-[100px] flex flex-col justify-center">
        <div className="relative flex items-center h-2">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 100}
            step={0.5}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
          <span>{formatDuration(Math.round(currentTime))}</span>
          <span>{formatDuration(Math.round(effectiveDuration))}</span>
        </div>
      </div>

      {/* Playback Speed Pill */}
      <button
        type="button"
        onClick={cycleSpeed}
        className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition shrink-0"
        title="Change Speed (1x, 1.25x, 1.5x, 2x)"
      >
        {playbackRate}x
      </button>

      {/* Download Button */}
      <a
        href={recordingUrl}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition shrink-0"
        title="Download Call Recording for QA Audit"
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
