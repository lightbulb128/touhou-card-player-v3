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
    <IconButton onClick={onClick} disabled={disabled} size="large">
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
        <LeftIcon fontSize="large"/>
      </PlaybackIconButton>
      <PlaybackIconButton disabled={playback.isCountingDown} onClick={playback.isPlaying ? onPause : onPlay} >
        {playback.isPlaying ? <PauseIcon fontSize="large"/> : <PlayIcon fontSize="large"/>}
      </PlaybackIconButton>
      <PlaybackIconButton disabled={playback.isCountingDown} onClick={onNextMusic} >
        <RightIcon fontSize="large"/>
      </PlaybackIconButton>
    </Stack>
  );
  if (!showSlider) {
    return buttons;
  }
  return <Stack direction="column" spacing={1} alignItems="center" width="100%" justifyContent="center">
    <Stack direction="row" spacing={3} alignItems="center" width="100%" justifyContent="center">
      <div>{formatTime(playback.currentTime)}</div>
      <Slider value={playback.currentTime} 
        min={0} max={playback.duration} 
        sx={{ width: "clamp(0px, 40%, 300px)" }}
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