import { Box, Stack, Typography } from "@mui/material";
import { 
  getMusicInfoFromCharacterId,
  GlobalData, MusicSelectionMap, Playback, PlaybackState
} from "../types/Configs";
import {theme} from "./Theme";
import PlayerControl from "./PlayerControl";

export interface ListTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  characterTemporaryDisabled: Map<string, boolean>;
  currentCharacterId: string;
  playingOrder: string[];
  playback: Playback;
  playbackState: PlaybackState;
  volume: number;
  setCurrentCharacterId: (id: string) => void;
  setCharacterTemporaryDisabled: (map: Map<string, boolean>) => void;
  setPlayback: (playback: Playback) => void;
  setPlaybackTime?: (time: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setVolume: (volume: number) => void;
  onNextMusic: () => void;
  onPreviousMusic: () => void;
  onPlay(): void;
  onPause(): void;
}

export default function ListTab(props: ListTabProps) {
  const currentMusicInfo = getMusicInfoFromCharacterId(
    props.data, props.musicSelection, props.currentCharacterId
  );
  const typographySx = {
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
  }
  return (
    <Stack direction="column" spacing={1}>
      <Stack direction="column" spacing={0} alignItems="center">
        <Typography sx={{...typographySx, fontSize: "clamp(1em, 1.5em, 3vw)"}}>
          {currentMusicInfo ? currentMusicInfo.title : "No Music Selected"}
        </Typography>
        <Typography sx={{...typographySx, fontSize: "clamp(0.8em, 1.2em, 2.4vw)", color: "text.secondary" }}>
          {currentMusicInfo ? currentMusicInfo.album : ""}
        </Typography>
        <Typography sx={{...typographySx, fontSize: "clamp(0.8em, 1.2em, 2.4vw)", color: "text.secondary" }}>
          {props.currentCharacterId}
        </Typography>
      </Stack>
      <PlayerControl 
        showSlider={true}
        data={props.data}
        currentCharacterId={props.currentCharacterId}
        playback={props.playback}
        playbackState={props.playbackState}
        volume={props.volume}
        setPlayback={props.setPlayback}
        setPlaybackTime={props.setPlaybackTime}
        setPlaybackState={props.setPlaybackState}
        setVolume={props.setVolume}
        onNextMusic={props.onNextMusic}
        onPreviousMusic={props.onPreviousMusic}
        onPlay={props.onPlay}
        onPause={props.onPause}
      />
      <Stack direction="column" spacing={0}>
        {props.playingOrder.map((charId, index) => {
          const charData = props.data.characterConfigs.get(charId);
          if (!charData) return null;
          const isDisabled = props.characterTemporaryDisabled.get(charId) ?? false;
          const musicInfo = getMusicInfoFromCharacterId(props.data, props.musicSelection, charId);
          if (!musicInfo) return null;
          let backgroundColor = index % 2 === 0 ? theme.custom.listBackground1 : theme.custom.listBackground2;
          if (isDisabled) {
            backgroundColor = "#737373ff";
          }
          if (charId === props.currentCharacterId) {
            backgroundColor = "#c14848ff";
          }
          let textcolor = theme.palette.text.primary;
          if (charId === props.currentCharacterId || isDisabled) {
            textcolor = "white";
          }
          return (
            <Box key={charId} 
              sx={{
                width: "100%",
                backgroundColor: backgroundColor,
                height: "1.7rem",
                display: "flex",
                alignItems: "center",
                paddingLeft: "0.5rem",
              }}
              onClick={() => {
                if (isDisabled) {
                  // set to enabled
                  const newMap = new Map(props.characterTemporaryDisabled);
                  newMap.set(charId, false);
                  props.setCharacterTemporaryDisabled(newMap);
                }
                props.setCurrentCharacterId(charId);
              }}
            >
              <Typography
                sx={{
                  userSelect: "none",
                  textDecoration: isDisabled ? "line-through" : "none",
                  color: textcolor,
                }}
              >
                {charId} ({musicInfo.title})
              </Typography>
            </Box>
          )
        })}
      </Stack>
    </Stack>
  );
}
