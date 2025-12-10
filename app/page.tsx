"use client";

import { useEffect, useState, useRef } from "react";
import PlayerTab from "./components/PlayerTab";
import { 
  CharacterConfig, CharacterId, 
  createPlayingOrder, GlobalData, 
  MusicInfo, MusicSelectionMap, 
  MusicUniqueId, Playback, PlaybackSetting, 
  PlaybackState 
} from "./types/Configs";
import { Box, Button, CssBaseline, Paper, Stack, Tab, Tabs } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CreateTheme from "./components/Theme";
import CustomTabs from "./components/CustomTabs";
import ListTab from "./components/ListTab";
import GameTab from "./components/GameTab";

function TabContainer({
  children
}: {
  children: React.ReactNode;
}) {
  return <Box
    sx={{ width: "100%", paddingLeft: 2, paddingRight: 2 }}
  >
    <Paper
      sx={{ padding: 2, width: "100%", overflow: "hidden" }}
    >
      {children}
    </Paper>
  </Box>
}

export default function Home() {

  const theme = CreateTheme();

  // refs
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const countdownAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // states
  const [globalData, setGlobalData] = useState<GlobalData>(new GlobalData());
  const [activeTab, setActiveTab] = useState<number>(0);
  const [playback, setPlayback] = useState<Playback>(new Playback());
  const [musicSelection, setMusicSelection] = useState<MusicSelectionMap>(new Map());
  const [currentCharacterId, setCurrentCharacterId] = useState<CharacterId>("");
  const [characterTemporaryDisabled, setCharacterTemporaryDisabled] = useState<Map<CharacterId, boolean>>(new Map());
  const [playingOrder, setPlayingOrder] = useState<Array<CharacterId>>([]);
  const [playbackSetting, setPlaybackSetting] = useState<PlaybackSetting>({ 
    countdown: false, randomStartPosition: false, playbackDuration: 0
  })
  const [pauseTimeoutHandle, setPauseTimeoutHandle] = useState<NodeJS.Timeout | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.Stopped);

  // region utility funcs
  const getMusicId = (character: CharacterId): MusicUniqueId | null => {
    const selection = musicSelection.get(character);
    if (selection === undefined || selection === -1) {
      return null;
    }
    const characterConfig = globalData.characterConfigs.get(character);
    if (!characterConfig) {
      return null;
    }
    const musicList = characterConfig.musics;
    if (selection < 0 || selection >= musicList.length) {
      return null;
    }
    const musicId = musicList[selection];
    return musicId;
  }
  
  const getMusicSourceUrl = (character: CharacterId): string | null => {
    const musicId = getMusicId(character);
    if (musicId === null) {
      return null;
    }
    const sourceUrl = globalData.sources.get(musicId);
    return sourceUrl || null;
  }

  const getMusicInfo = (character: CharacterId): MusicInfo | null => {
    let musicName = getMusicId(character);
    if (musicName === null) {
      return null;
    }
    return {
      ...getMusicInfo(musicName),
      characterId: character
    } as MusicInfo;
  }

  const setRandomPlaybackPosition = () => {
    if (audioElementRef.current && playbackSetting.randomStartPosition) {
      const duration = audioElementRef.current.duration;
      const randomPosition = (duration < 10) ? 0 : Math.random() * (duration - 10);
      audioElementRef.current.currentTime = randomPosition;
      setPlayback((original) => {
        return { ...original, currentTime: randomPosition };
      });
    }
  }

  const setPlaybackTime = (time: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = time;
      setPlayback((original) => {
        return { ...original, currentTime: time };
      });
    }
  }

  // region effects
  // fetch data
  useEffect(() => {
    const load = async () => {
      const fetchJson = async (path: string) => {
        const resp = await fetch(path);
        return resp.json();
      };

      const [characters, sources, presets] = await Promise.all([
        fetchJson("/character.json"),
        fetchJson("/sources.json"),
        fetchJson("/idpresets.json"),
      ]);

      setGlobalData((original) => { 
        original.applyFetchedCharacters(characters); 
        original.applyFetchedSources(sources);
        original.applyFetchedPresets(presets);
        return original;
      });

      // set music selection to 0 for all characters
      const initialSelection: MusicSelectionMap = new Map();
      for (const charId in characters) {
        initialSelection.set(charId, 0);
      }
      setMusicSelection(initialSelection);

      // create playing order
      const order = createPlayingOrder(globalData, musicSelection, characterTemporaryDisabled, false);
      setPlayingOrder(order);

      // set current character to the first one
      setCurrentCharacterId(order.length > 0 ? order[0] : "");
    };

    load().catch((err) => {
      console.error("Failed to load public data", err);
    });
  }, []);

  // update audio source when currentCharacterId
  useEffect(() => {
    if (currentCharacterId === "") {
      return;
    }
    const sourceUrl = getMusicSourceUrl(currentCharacterId);
    if (audioElementRef.current) {
      if (sourceUrl) {
        audioElementRef.current.src = sourceUrl;
        audioElementRef.current.load();
      } else {
        audioElementRef.current.src = "";
      }
      if (playbackSetting.countdown && (
        playbackState === PlaybackState.Playing ||
        playbackState === PlaybackState.TimeoutPause
      )) {
        // play countdown audio first
        if (countdownAudioElementRef.current) {
          countdownAudioElementRef.current.currentTime = 0;
          countdownAudioElementRef.current.play();
        }
        setPlaybackState(PlaybackState.CountingDown);
      }
    }
  }, [currentCharacterId]);

  // region handlers

  const resetPauseTimeout = () => {
    if (pauseTimeoutHandle) {
      clearTimeout(pauseTimeoutHandle);
      setPauseTimeoutHandle(null);
    }
    if (playbackSetting.playbackDuration > 0) {
      const timeoutHandle = setTimeout(() => {
        if (audioElementRef.current) {
          audioElementRef.current.pause();
        }
        console.log("Auto pausing playback due to timeout");
        setPlaybackState(PlaybackState.TimeoutPause);
        setPauseTimeoutHandle(null);
      }, playbackSetting.playbackDuration * 1000);
      setPauseTimeoutHandle(timeoutHandle);
    }
  }

  const handleCountdownEnded = () => {
    if (audioElementRef.current) {
      if (playbackSetting.randomStartPosition) {
        setRandomPlaybackPosition();
      }
      audioElementRef.current.play();
      resetPauseTimeout();
      setPlaybackState(PlaybackState.Playing);
    }
  }

  const handlePlay = () => {
    if (audioElementRef.current) {
      audioElementRef.current.play();
      setPlaybackState(PlaybackState.Playing);
    }
  };

  const handlePause = () => {
    if (pauseTimeoutHandle) {
      clearTimeout(pauseTimeoutHandle);
      setPauseTimeoutHandle(null);
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      setPlaybackState(PlaybackState.Stopped);
    }
  }

  const handleAudioLoadedData = () => {
    // Auto play when data is loaded
    if ((
      playbackState === PlaybackState.Playing || 
      playbackState === PlaybackState.TimeoutPause
    ) && audioElementRef.current) {
      if (playbackSetting.randomStartPosition) {
        setRandomPlaybackPosition();
      }
      audioElementRef.current.play();
      resetPauseTimeout();
      setPlaybackState(PlaybackState.Playing);
    }
  }

  const handleNextMusic = () => {
    // find next whose (1) selection is not -1 (2) not temporarily disabled
    let currentIndex = playingOrder.indexOf(currentCharacterId);
    const totalCharacters = playingOrder.length;
    for (let offset = 1; offset <= totalCharacters; offset++) {
      const nextIndex = (currentIndex + offset) % totalCharacters;
      const nextCharId = playingOrder[nextIndex];
      const selection = musicSelection.get(nextCharId);
      const isDisabled = characterTemporaryDisabled.get(nextCharId);
      if (selection !== undefined && selection !== -1 && !isDisabled) {
        setCurrentCharacterId(nextCharId);
        break;
      }
    }
  }

  const handlePreviousMusic = () => {
    // find previous whose (1) selection is not -1 (2) not temporarily disabled
    let currentIndex = playingOrder.indexOf(currentCharacterId);
    const totalCharacters = playingOrder.length;
    for (let offset = 1; offset <= totalCharacters; offset++) {
      const prevIndex = (currentIndex - offset + totalCharacters) % totalCharacters;
      const prevCharId = playingOrder[prevIndex];
      const selection = musicSelection.get(prevCharId);
      const isDisabled = characterTemporaryDisabled.get(prevCharId);
      if (selection !== undefined && selection !== -1 && !isDisabled) {
        setCurrentCharacterId(prevCharId);
        break;
      }
    }
  }

  // region render
  const tabButton = (id: number, name: string) => {
    return (
      <Button
        key={name}
        variant={activeTab === id ? "contained" : "outlined"}
        onClick={() => setActiveTab(id)}
      >
        {name}
      </Button>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{display: "none"}}>
        <audio id="audio-element" ref={audioElementRef}
          onLoadedData={handleAudioLoadedData}
          onLoadedMetadata={
            () => {
              // set playback.duration
              if (audioElementRef.current) {
                setPlayback({...playback, duration: audioElementRef.current!.duration});
              }
            }
          }
          onTimeUpdate={
            () => {
              // set playback.currentTime
              if (audioElementRef.current) {
                setPlayback({
                  ...playback,
                  currentTime: audioElementRef.current!.currentTime,
                });
              }
            }
          }
        ></audio>
        <audio id="countdown-audio-element" ref={countdownAudioElementRef}
          src="https://r2bucket-touhou.hgjertkljw.org/mp3/Bell3.mp3"
          onEnded={handleCountdownEnded}
        ></audio>
      </div>
      <div><main><Box sx={{ width: "100%" }}>
        <Stack direction="column" spacing={2} sx={{
          width: "100%", alignItems: "center", paddingTop: 2
        }}>
          <Stack direction="row" spacing={2}>
            {tabButton(0, "Player")}
            {tabButton(1, "List")}
            {tabButton(2, "Configs")}
            {tabButton(3, "Practice")}
          </Stack>
          <CustomTabs activeTab={activeTab} onChange={setActiveTab} innerTabs={[
            <TabContainer>
              <PlayerTab
                data={globalData}
                playingOrder={playingOrder}
                musicSelection={musicSelection}
                characterTemporaryDisabled={characterTemporaryDisabled}
                currentCharacterId={currentCharacterId as CharacterId}
                playback={playback}
                playbackSetting={playbackSetting}
                playbackState={playbackState}
                setPlaybackState={setPlaybackState}
                setPlayback={setPlayback}
                setCharacterTemporaryDisabled={setCharacterTemporaryDisabled}
                setPlayingOrder={setPlayingOrder}
                setCurrentCharacterId={setCurrentCharacterId}
                setPlaybackSetting={setPlaybackSetting}
                setPlaybackTime={setPlaybackTime}
                onPreviousMusic={handlePreviousMusic}
                onNextMusic={handleNextMusic}
                onPlay={handlePlay}
                onPause={handlePause}
              ></PlayerTab>
            </TabContainer>,
            <TabContainer>
              <ListTab
                data={globalData}
                musicSelection={musicSelection}
                characterTemporaryDisabled={characterTemporaryDisabled}
                currentCharacterId={currentCharacterId as CharacterId}
                playingOrder={playingOrder}
                setCurrentCharacterId={setCurrentCharacterId}
                setCharacterTemporaryDisabled={setCharacterTemporaryDisabled}
                playback={playback}
                playbackState={playbackState}
                setPlayback={setPlayback}
                setPlaybackState={setPlaybackState}
                setPlaybackTime={setPlaybackTime}
                onNextMusic={handleNextMusic}
                onPreviousMusic={handlePreviousMusic}
                onPlay={handlePlay}
                onPause={handlePause}
              ></ListTab>
            </TabContainer>,
            <TabContainer>Configs</TabContainer>,
            <TabContainer>
              <GameTab
                data={globalData}
                musicSelection={musicSelection}
                characterTemporaryDisabled={characterTemporaryDisabled}
                currentCharacterId={currentCharacterId}
                playingOrder={playingOrder}
                setCurrentCharacterId={setCurrentCharacterId}
              ></GameTab>
            </TabContainer>
          ]}>
          </CustomTabs>
        </Stack>
      </Box></main></div>
    </ThemeProvider>
  );
}
