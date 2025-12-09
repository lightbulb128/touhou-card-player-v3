"use client";

import { Box, Button, Grid, Stack, TextField, Typography } from "@mui/material";
import { 
  CharacterId, createPlayingOrder, 
  getMusicInfoFromCharacterId, GlobalData, 
  MusicSelectionMap, Playback, PlaybackSetting,
  PlaybackState
} from "../types/Configs";
import PlayerControl from "./PlayerControl";
import MusicCardDisplay from "./MusicCardDisplay";
import { CardBackgroundState, CharacterCard } from "./CharacterCard";
import { useState } from "react";


export interface PlayerTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  playback: Playback;
  playingOrder: Array<CharacterId>;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  playbackSetting: PlaybackSetting;
  playbackState: PlaybackState;
  setPlayback: (playback: Playback) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setCharacterTemporaryDisabled: (map: Map<CharacterId, boolean>) => void;
  setPlayingOrder: (order: Array<CharacterId>) => void;
  setCurrentCharacterId: (characterId: CharacterId) => void;
  setPlaybackSetting: (setting: PlaybackSetting) => void;
  setPlaybackTime?: (time: number) => void;
  onNextMusic: () => void;
  onPreviousMusic: () => void;
  onPlay(): void;
  onPause(): void;
};

export default function PlayerTab({
  data, currentCharacterId, playback, setPlayback, playingOrder,
  musicSelection, 
  onNextMusic, onPreviousMusic, onPlay, onPause,
  characterTemporaryDisabled, setCharacterTemporaryDisabled, setPlayingOrder, setCurrentCharacterId,
  playbackSetting, setPlaybackSetting, setPlaybackTime,
  playbackState, setPlaybackState,
}: PlayerTabProps) {

  const [hoveringCharacterId, setHoveringCharacterId] = useState<CharacterId | null>(null);
  const [playbackDurationString, setPlaybackDurationString] = useState<string>("0");
  
  let currentIndex = playingOrder.indexOf(currentCharacterId);
  if (currentIndex === -1) {
    currentIndex = 0;
  }
  let placeholderCardSource = data.getAnyCardSource();

  const upcomingCards = [];
  {
    const singleCardWp = 10; // wp = width percentage
    const cardInGroupOverlapWp = 8;
    const groupOverlapWp = 2;
    const playedOffsetWp = 20;
    let baseOffset = 0;
    // add a placeholder card first
    upcomingCards.push(<CharacterCard
      key={`placeholder-card`}
      imageSource={placeholderCardSource}
      backgroundState={CardBackgroundState.Placeholder}
      raised={false}
      width={`${singleCardWp}%`}
      sx={{
        visibility: "hidden",
      }}
    />);
    playingOrder.forEach((characterId, index) => {
      if (index <= currentIndex) {
        const cardCount = data.characterConfigs.get(characterId)?.card.length || 1;
        baseOffset += singleCardWp - groupOverlapWp + (cardCount - 1) * (singleCardWp - cardInGroupOverlapWp);
      }
    })
    let accumulate = -baseOffset - playedOffsetWp;
    let totalCards = 0;
    playingOrder.forEach((characterId) => {
      const cards = data.characterConfigs.get(characterId)?.card || [placeholderCardSource];
      totalCards += cards.length;
    });
    let counter = 0;
    playingOrder.forEach((characterId, index) => {
      const cards = data.characterConfigs.get(characterId)?.card || [placeholderCardSource];
      const cardCount = cards.length;
      let background = CardBackgroundState.Normal;
      if (characterId === hoveringCharacterId) {
        if (characterTemporaryDisabled.get(characterId)) {
          background = CardBackgroundState.DisabledHover;
        } else {
          background = CardBackgroundState.Hover;
        }
      } else {
        if (characterTemporaryDisabled.get(characterId)) {
          background = CardBackgroundState.Disabled;
        } else {
          background = CardBackgroundState.Normal;
        }
      }
      cards.forEach((cardSource, cardIndex) => {
        const element = <CharacterCard
          key={`${characterId}-card-${cardIndex}`}
          imageSource={cardSource}
          backgroundState={background}
          width={`${singleCardWp}%`}
          sx={{
            position: "absolute",
            left: `${accumulate}%`,
            transition: "left 0.5s ease-in-out, transform 0.3s ease, background-color 0.3s ease, filter 0.3s ease",
            zIndex: totalCards - counter,
          }}
          raised={characterId === hoveringCharacterId}
          onMouseEnter={() => setHoveringCharacterId(characterId)}
          onMouseLeave={() => setHoveringCharacterId(null)}
          onClick={() => {
            const newMap = new Map(characterTemporaryDisabled);
            const currentlyDisabled = newMap.get(characterId) || false;
            newMap.set(characterId, !currentlyDisabled);
            setCharacterTemporaryDisabled(newMap);
          }}
        />
        counter += 1;
        upcomingCards.push(element);
        if (cardIndex < cardCount - 1) {
          accumulate += singleCardWp - cardInGroupOverlapWp;
        } else {
          accumulate += singleCardWp - groupOverlapWp;
        }
      })
      if (index === currentIndex) {
        accumulate += playedOffsetWp;
      }
    });
  }

  const regeneratePlayingOrder = (shuffle: boolean) => {
    const newTemporaryDisabled = new Map<CharacterId, boolean>();
    data.characterConfigs.forEach((_, characterId) => {
      if (musicSelection.get(characterId) === -1) return;
      newTemporaryDisabled.set(characterId, false);
    });
    const newPlayingOrder = createPlayingOrder(data, musicSelection, newTemporaryDisabled, shuffle);
    const newCurrentCharacterId = newPlayingOrder[0];
    setPlayingOrder(newPlayingOrder);
    setCharacterTemporaryDisabled(newTemporaryDisabled);
    setCurrentCharacterId(newCurrentCharacterId);
    onPause();
  }

  return (
    <div>
      <Stack direction="column" spacing={2} alignItems="center"
        sx={{
          width: "100%",
        }}
      >
        <Stack direction="row" spacing={0}
          sx={{
            width: "100%",
            display: "flex",
            position: "relative",
            height: "auto",
          }}
        >
          {/* Place holder card to keep height */}
          <Box sx={{ visibility: "hidden", width: "100%" }}>
            <MusicCardDisplay
              cardSources={[placeholderCardSource]}
              title={"Placeholder"}
              album={"Placeholder"}
              characterId={"Placeholder"}
              expanded={false}
            />
          </Box>
          {playingOrder.map((characterId, index) => {
            const characterData = data.characterConfigs.get(characterId);
            const cardSources = characterData?.card || [];
            let musicInfo = getMusicInfoFromCharacterId(data, musicSelection, characterId);
            if (!musicInfo) {
              musicInfo = {
                characterId: characterId,
                title: "Unknown Title",
                album: "Unknown Album",
              }
            }
            return (
              <Box
                key={characterId}
                sx={{ 
                  width: "100%",
                  position: "absolute",
                  transform: `translateX(${(index - currentIndex) * 100}%)`,
                  transition: "transform 0.3s ease-in-out",
                }}
              >
                <MusicCardDisplay
                  key={characterId}
                  cardSources={cardSources}
                  title={musicInfo.title}
                  album={musicInfo.album}
                  characterId={characterId}
                  expanded={index === currentIndex}
                />
              </Box>
            );
          })}
        </Stack>
        <PlayerControl
          showSlider={true}
          data={data}
          currentCharacterId={currentCharacterId}
          playback={playback}
          playbackState={playbackState}
          setPlayback={setPlayback}
          setPlaybackState={setPlaybackState}
          setPlaybackTime={setPlaybackTime}
          onNextMusic={onNextMusic}
          onPreviousMusic={onPreviousMusic}
          onPlay={onPlay}
          onPause={onPause}
        ></PlayerControl>
        <Stack direction="column" spacing={1} width="100%">
          <Typography variant="body1" color="text.secondary">
            Upcoming
          </Typography>
          <Stack direction="row" spacing={0}
            sx={{
              width: "100%",
              display: "flex",
              position: "relative",
              height: "auto",
            }}
          >
            {upcomingCards}
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} width="100%" alignItems="center" justifyContent="center">
          <Button variant="outlined" sx={{ width: "8rem" }} color="secondary" onClick={() => {
            regeneratePlayingOrder(true);
          }}>Shuffle</Button>
          <Button variant="outlined" sx={{ width: "8rem" }} color="secondary" onClick={() => {
            regeneratePlayingOrder(false);
          }}>Sort</Button>
        </Stack>
        <Stack direction="row" spacing={1} width="100%" alignItems="center" justifyContent="center">
          <Button 
            variant={playbackSetting.randomStartPosition ? "contained" : "outlined"}
            sx={{ width: "8rem" }} 
            onClick={() => {
              setPlaybackSetting({
                ...playbackSetting,
                randomStartPosition: !playbackSetting.randomStartPosition,
              });
            }}
          >Random start</Button>
          <Button 
            variant={playbackSetting.countdown ? "contained" : "outlined"}
            sx={{ width: "8rem" }} 
            onClick={() => {
              setPlaybackSetting({
                ...playbackSetting,
                countdown: !playbackSetting.countdown,
              });
            }}
          >Countdown</Button>
        </Stack>
        <Stack direction="row" spacing={1} width="100%" alignItems="center" justifyContent="center">
          <TextField
            label="Playback Duration (seconds)"
            value={playbackDurationString}
            onChange={(e) => setPlaybackDurationString(e.target.value)}
            sx={{ width: "16rem" }}
            size="small"
            type="number"
            onBlur={() => {
              let duration = parseInt(playbackDurationString);
              if (isNaN(duration) || duration < 0) {
                duration = 0;
              }
              setPlaybackDurationString(duration.toString());
              setPlaybackSetting({
                ...playbackSetting,
                playbackDuration: duration,
              });
            }}
          />
        </Stack>

      </Stack>
    </div>
  )
}