import { Box, Button, Grid, Stack, TextField, Typography } from "@mui/material";
import { 
  CharacterId, createPlayingOrder, 
  getMusicInfoFromCharacterId, GlobalData, 
  MusicSelectionMap, Playback, PlaybackSetting,
  PlaybackState
} from "../types/Configs";

export interface GameTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  setCurrentCharacterId: (characterId: CharacterId) => void;
}

export default function GameTab({
  data, 
  musicSelection,
  currentCharacterId, 
  setCurrentCharacterId
}: GameTabProps) {
  return (
    <Box>
      <Typography variant="h4">Game Tab</Typography>
      <Typography variant="body1">This is a placeholder for the Game Tab.</Typography>
    </Box>
  )
}