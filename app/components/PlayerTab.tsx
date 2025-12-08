import { Grid, Stack, Typography } from "@mui/material";
import { CharacterId, GlobalData, Playback } from "../types/Configs";
import PlayerControl from "./PlayerControl";


export interface PlayerTabProps {
  data: GlobalData;
  currentCharacterId: CharacterId;
  playback: Playback;
  setPlayback: (playback: Playback) => void;
  onNextMusic: () => void;
  onPreviousMusic: () => void;
  onPlay(): void;
  onPause(): void;
};

export default function PlayerTab({
  data, currentCharacterId, playback, setPlayback,
  onNextMusic, onPreviousMusic, onPlay, onPause
}: PlayerTabProps) {


  return (
    <div>
      <Stack direction="column" spacing={2} alignItems="center">
        <Typography variant="h5">Now Playing</Typography>
        <Typography variant="h6">{
          currentCharacterId
        }</Typography>
        <PlayerControl
          showSlider={true}
          data={data}
          currentCharacterId={currentCharacterId}
          playback={playback}
          setPlayback={setPlayback}
          onNextMusic={onNextMusic}
          onPreviousMusic={onPreviousMusic}
          onPlay={onPlay}
          onPause={onPause}
        ></PlayerControl>
      </Stack>
    </div>
  )
}