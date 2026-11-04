import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { formatClock } from '@/lib/format';
import playIcon from '@/assets/figma/video-play-icon.svg';

export const SAMPLE_VIDEO = '/media/sample-lesson.mp4';
export const SAMPLE_CAPTIONS = '/media/sample-lesson.en.vtt';

interface VideoPlayerProps {
  title: string;
  src?: string;
  captions?: string;
  onEnded?: () => void;
}

/**
 * PROTOTYPE player (Figma "Media/Video Player"). Plays a local synthetic sample video.
 * Seeking is unrestricted and playback is NOT tracked or validated by the server:
 * skip prevention and server-validated progress are Sprint 3 features.
 */
export function VideoPlayer({
  title,
  src = SAMPLE_VIDEO,
  captions = SAMPLE_CAPTIONS,
  onEnded,
}: VideoPlayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(true);

  useEffect(() => {
    const track = video.current?.textTracks?.[0];
    if (track) track.mode = captionsOn ? 'showing' : 'hidden';
  }, [captionsOn]);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play()?.catch(() => setPlaying(false));
    else el.pause();
  };

  return (
    <div className="video-frame">
      <video
        ref={video}
        src={src}
        preload="metadata"
        playsInline
        aria-label={`${title} (prototype video)`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onClick={toggle}
      >
        <track kind="captions" src={captions} srcLang="en" label="English" default />
      </video>

      <span className="prototype-label">Prototype video · progress not tracked</span>

      {!playing && (
        <button
          type="button"
          className="video-overlay-play"
          onClick={toggle}
          aria-label={`Play ${title}`}
        >
          <img src={playIcon} alt="" width={25} height={29} />
        </button>
      )}

      <div className="video-controls">
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <label className="sr-only" htmlFor="video-seek">
          Seek
        </label>
        <input
          id="video-seek"
          className="seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={time}
          aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
          onChange={(e) => {
            const el = video.current;
            if (el) el.currentTime = Number(e.target.value);
            setTime(Number(e.target.value));
          }}
        />
        <span className="time" aria-hidden="true">
          {formatClock(time)} / {formatClock(duration)}
        </span>
        <button
          type="button"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={() => {
            const el = video.current;
            if (el) el.muted = !muted;
            setMuted(!muted);
          }}
        >
          <Icon name={muted ? 'mute' : 'volume'} size={18} />
        </button>
        <button
          type="button"
          aria-label="Captions"
          aria-pressed={captionsOn}
          onClick={() => setCaptionsOn((v) => !v)}
        >
          <Icon name="captions" size={18} />
        </button>
        <label className="sr-only" htmlFor="video-rate">
          Playback speed
        </label>
        <select
          id="video-rate"
          value={rate}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (video.current) video.current.playbackRate = value;
            setRate(value);
          }}
        >
          <option value={1}>1×</option>
          <option value={1.25}>1.25×</option>
          <option value={1.5}>1.5×</option>
        </select>
        <button
          type="button"
          aria-label="Full screen"
          onClick={() => void video.current?.requestFullscreen?.().catch(() => undefined)}
        >
          <Icon name="fullscreen" size={18} />
        </button>
      </div>
    </div>
  );
}
