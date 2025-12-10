import { Box, Button, Grid, Stack, TextField, Typography } from "@mui/material";
import { 
  CharacterId, createPlayingOrder, 
  getMusicInfoFromCharacterId, GlobalData, 
  MusicSelectionMap, Playback, PlaybackSetting,
  PlaybackState
} from "../types/Configs";
import { useState, useEffect, JSX } from "react";
import { CardInfo, GameJudge } from "../types/GameJudge";
import { CardBackgroundState } from "./CharacterCard";

export interface GameTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  playingOrder: Array<CharacterId>;
  setCurrentCharacterId: (characterId: CharacterId) => void;
}

type CardRenderProps = {
  cardInfo: CardInfo;
  x: number;
  y: number;
  width: string;
  source: string;
  backgroundState: CardBackgroundState;
  upsideDown: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function GameTab({
  data, 
  musicSelection,
  currentCharacterId, 
  characterTemporaryDisabled,
  playingOrder,
  setCurrentCharacterId
}: GameTabProps) {

  // states
  const [judge, setJudge] = useState<GameJudge>(new GameJudge());

  // effects
  useEffect(() => {
    judge.playingOrder = playingOrder;
    judge.characterTemporaryDisabled = characterTemporaryDisabled;
    judge.currentCharacterId = currentCharacterId;
    setJudge(judge.reconstruct());
  }, [playingOrder, characterTemporaryDisabled, currentCharacterId]);

  
  const playOrderSet = new Set(playingOrder);
  const cards: Map<CardInfo, CardRenderProps> = new Map();
  const naturalCardOrder: Array<CardInfo> = new Array<CardInfo>();
  data.characterConfigs.forEach((characterConfig, characterId) => {
    characterConfig.card.forEach((cardId, index) => {
      const cardInfo = new CardInfo(characterId, index);
      const props: CardRenderProps = {
        cardInfo: cardInfo,
        x: 0, y: 0,
        width: "8%",
        backgroundState: CardBackgroundState.Normal,
        source: cardId,
        upsideDown: false,
        onClick: undefined,
        onMouseEnter: undefined,
        onMouseLeave: undefined,
      }
      cards.set(cardInfo, props);
      naturalCardOrder.push(cardInfo);
    })
  });

  // render
  return (
    <Box>
      <Typography variant="h4">Game Tab</Typography>
      <Typography variant="body1">This is a placeholder for the Game Tab.</Typography>
    </Box>
  )
}