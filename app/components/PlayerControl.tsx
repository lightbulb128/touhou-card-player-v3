import { CharacterId, GlobalData, Playback } from "../types/Configs";
import { IconButton, Slider, Stack } from "@mui/material";
import {
  SkipNextRounded as RightIcon,
  SkipPreviousRounded as LeftIcon,
  PauseRounded as PauseIcon,
  PlayArrowRounded as PlayIcon,
} from "@mui/icons-material";

export interface PlayerControlProps {
  showSlider?: boolean;
  data: GlobalData;
  currentCharacterId: CharacterId;
  playback: Playback;
  setPlayback: (playback: Playback) => void;
  onNextMusic: () => void;
  onPreviousMusic: () => void;
  onPlay(): void;
  onPause(): void;
};

function PlaybackIconButton({ disabled, onClick, children }: 
  { 
    disabled: boolean; onClick: () => void,
    children?: React.ReactNode
  }
) {
  return (
    <IconButton onClick={onClick} disabled={disabled}>
      {children}
    </IconButton>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function PlayerControl({
  showSlider,
  data, currentCharacterId, playback, setPlayback,
  onNextMusic, onPreviousMusic, onPlay, onPause
}: PlayerControlProps) {
  const buttons = (
    <Stack direction="row" spacing={4} alignItems="center">
      <PlaybackIconButton 
        disabled={playback.isCountingDown} 
        onClick={onPreviousMusic} 
      >
        <LeftIcon />
      </PlaybackIconButton>
      <PlaybackIconButton disabled={playback.isCountingDown} onClick={playback.isPlaying ? onPause : onPlay} >
        {playback.isPlaying ? <PauseIcon /> : <PlayIcon />}
      </PlaybackIconButton>
      <PlaybackIconButton disabled={playback.isCountingDown} onClick={onNextMusic} >
        <RightIcon />
      </PlaybackIconButton>
    </Stack>
  );
  if (!showSlider) {
    return buttons;
  }
  return <Stack direction="column" spacing={2} alignItems="center">
    <Stack direction="row" spacing={4} alignItems="center">
      <div>{formatTime(playback.currentTime)}</div>
      <Slider value={playback.currentTime} 
        min={0} max={playback.duration} 
        sx={{ width: 300 }}
        onChange={(_, value) => {
          const newTime = Array.isArray(value) ? value[0] : value;
          const newPlayback = { ...playback, currentTime: newTime };
          setPlayback(newPlayback);
        }}
      />
      <div>{formatTime(playback.duration)}</div>
    </Stack>
    {buttons}
  </Stack>;
}