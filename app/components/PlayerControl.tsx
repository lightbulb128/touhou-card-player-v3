import { CharacterId, GlobalData, Playback, PlaybackState } from "../types/Configs";
import { IconButton, Slider, Stack, Typography } from "@mui/material";
import {
  SkipNextRounded as RightIcon,
  SkipPreviousRounded as LeftIcon,
  PauseRounded as PauseIcon,
  PlayArrowRounded as PlayIcon,
} from "@mui/icons-material";
import { MonospaceFontFamily } from "./Theme";

export interface PlayerControlProps {
  showSlider?: boolean;
  data: GlobalData;
  currentCharacterId: CharacterId;
  playback: Playback;
  playbackState: PlaybackState;
  setPlayback: (playback: Playback) => void;
  setPlaybackTime?: (time: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  onNextMusic: () => void;
  onPreviousMusic: () => void;
  onPlay(): void;
  onPause(): void;
};

function PlaybackIconButton({ disabled, onClick, children }: 
  { 
    disabled?: boolean; onClick: () => void,
    children?: React.ReactNode
  }
) {
  if (disabled === undefined) {
    disabled = false;
  }
  return (
    <IconButton 
      onClick={onClick} disabled={disabled} size="large"
      color="primary"
    >
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
  playback,
  playbackState,
  onNextMusic, onPreviousMusic, onPlay, onPause,
  setPlaybackTime
}: PlayerControlProps) {
  const buttons = (
    <Stack direction="row" spacing={4} alignItems="center">
      <PlaybackIconButton 
        onClick={onPreviousMusic} 
      >
        <LeftIcon fontSize="large"/>
      </PlaybackIconButton>
      <PlaybackIconButton 
        disabled={playbackState === PlaybackState.CountingDown}
        onClick={playbackState !== PlaybackState.Playing ? onPlay : onPause}
      >
        {playbackState !== PlaybackState.Playing ? <PlayIcon fontSize="large"/> : <PauseIcon fontSize="large"/>}
      </PlaybackIconButton>
      <PlaybackIconButton onClick={onNextMusic} >
        <RightIcon fontSize="large"/>
      </PlaybackIconButton>
    </Stack>
  );
  if (!showSlider) {
    return buttons;
  }
  return <Stack direction="column" spacing={1} alignItems="center" width="100%" justifyContent="center">
    <Stack direction="row" spacing={3} alignItems="center" width="100%" justifyContent="center">
      <Typography fontFamily={MonospaceFontFamily}>{formatTime(playback.currentTime)}</Typography>
      <Slider value={playback.currentTime} 
        min={0} max={playback.duration} 
        sx={{ width: "clamp(0px, 40%, 300px)" }}
        onChange={(_, value) => {
          const newTime = Array.isArray(value) ? value[0] : value;
          if (setPlaybackTime) {
            setPlaybackTime(newTime);
          }
        }}
      />
      <Typography fontFamily={MonospaceFontFamily}>{formatTime(playback.duration)}</Typography>
    </Stack>
    {buttons}
  </Stack>;
}