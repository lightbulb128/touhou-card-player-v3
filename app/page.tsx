"use client";

import { useEffect, useState, useRef } from "react";
import PlayerTab from "./components/PlayerTab";
import { CharacterConfig, CharacterId, GlobalData, MusicInfo, MusicSelectionMap, MusicUniqueId, Playback } from "./types/Configs";
import { Box, Button, CssBaseline, Paper, Stack, Tab, Tabs } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CreateTheme from "./components/Theme";
import CustomTabs from "./components/CustomTabs";

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

function createPlayingOrder(
  globalData: GlobalData,
  musicSelection: MusicSelectionMap,
  temporaryDisabled: Map<CharacterId, boolean>,
  randomize: boolean
): Array<CharacterId> {
  const characterIds = Array.from(globalData.characterConfigs.keys());
  let filteredIds = characterIds.filter((charId) => {
    return musicSelection.get(charId) !== -1 && !temporaryDisabled.get(charId);
  });

  if (randomize) {
    // Shuffle the array
    for (let i = filteredIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filteredIds[i], filteredIds[j]] = [filteredIds[j], filteredIds[i]];
    }
  }
  
  return filteredIds;
}

export default function Home() {

  const theme = CreateTheme();

  type TabKey = "Player" | "Configs" | "Focus" | "Practice" | "Match";
  const allTabs = ["Player", "Configs", "Focus", "Practice", "Match"] as const;
  const tabNames = {
    "Player": "Play",
    "Configs": "Conf",
    "Focus": "Focu",
    "Practice": "Prac",
    "Match": "Matc"
  }

  // refs
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // states
  const [globalData, setGlobalData] = useState<GlobalData>(new GlobalData());
  const [activeTab, setActiveTab] = useState<number>(0);
  const [playback, setPlayback] = useState<Playback>(new Playback());
  const [musicSelection, setMusicSelection] = useState<MusicSelectionMap>(new Map());
  const [currentCharacterId, setCurrentCharacterId] = useState<CharacterId>("");
  const [characterTemporaryDisabled, setCharacterTemporaryDisabled] = useState<Map<CharacterId, boolean>>(new Map());
  const [playingOrder, setPlayingOrder] = useState<Array<CharacterId>>([]);

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

  // update audio source when currentCharacterId or musicSelection changes
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
    }
  }, [currentCharacterId, musicSelection]);

  // region handlers

  const handlePlay = () => {
    if (audioElementRef.current) {
      audioElementRef.current.play();
      setPlayback((original) => {
        original.isPlaying = true;
        return original;
      });
    }
  };

  const handlePause = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      setPlayback((original) => {
        original.isPlaying = false;
        return original;
      });
    }
  }

  const handleAudioLoadedData = () => {
    // Auto play when data is loaded
    if (playback.isPlaying && audioElementRef.current) {
      audioElementRef.current.play();
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
              console.log("Time update:", audioElementRef.current!.currentTime);
              if (audioElementRef.current) {
                setPlayback({
                  ...playback,
                  currentTime: audioElementRef.current!.currentTime,
                });
              }
            }
          }
        ></audio>
      </div>
      <div><main><Box sx={{ width: "100%" }}>
        <Stack direction="column" spacing={2} sx={{
          width: "100%", alignItems: "center", paddingTop: 2
        }}>
          <Stack direction="row" spacing={2}>
            {/* Use buttons with onClick handlers to switch tabs */}
            {allTabs.map((tabName, index) => (
              <Button
                key={tabName}
                variant={activeTab === index ? "contained" : "outlined"}
                onClick={() => setActiveTab(index)}
              >
                {tabNames[tabName as TabKey]}
              </Button>
            ))}
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
                setPlayback={setPlayback}
                setCharacterTemporaryDisabled={setCharacterTemporaryDisabled}
                onPreviousMusic={handlePreviousMusic}
                onNextMusic={handleNextMusic}
                onPlay={handlePlay}
                onPause={handlePause}
              ></PlayerTab>
            </TabContainer>,
            <TabContainer>Configs</TabContainer>,
            <TabContainer>Alice is best</TabContainer>,
            <TabContainer>Practice</TabContainer>,
            <TabContainer>Match</TabContainer>
          ]}>
          </CustomTabs>
        </Stack>
      </Box></main></div>
    </ThemeProvider>
  );
}
