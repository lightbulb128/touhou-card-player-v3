import { Box, Button, Collapse, Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from "@mui/material";
import { AddRounded, RemoveRounded, Task } from "@mui/icons-material";
import { CharacterId, getMusicInfo, GlobalData, MusicSelectionMap } from "../types/Configs";
import { Dispatch, useState } from "react";
import { CardCollections, DefaultMusicSource, MusicSources } from "../types/Consts";
import { CharacterCard } from "./CharacterCard";
import { PagePRNG } from "../types/PagePrng";
import { 
  CheckBoxOutlineBlank as NoneIcon, 
  IndeterminateCheckBox as PartialIcon, 
  CheckBox as FullIcon,
  Search
} from "@mui/icons-material";
import { MonospaceFontFamily, NoFontFamily } from "./Theme";

interface ConfigDrawerProps {
  title: string;
  children?: React.ReactNode;
}

function ConfigDrawer({...props}: ConfigDrawerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Paper
      variant="outlined"
      sx={{
        width: "100%",
        padding: 0,
        paddingLeft: 2,
        paddingRight: 1,
      }}
    >
      <Stack
        direction="column"
        spacing={0}
        sx={{
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
          onClick={() => setOpen(!open)}
        >
          <Typography variant="body1">
            {props.title}
          </Typography>
          <Button
            onClick={() => setOpen(!open)}
            size="small"
          >
            {open ? <RemoveRounded /> : <AddRounded />}
          </Button>
        </Box>
        <Collapse
          in={open}
        >
          <Stack direction="column" spacing={1} width="100%" paddingBottom={1}>
            <Divider />
            <Box width="100%" paddingLeft={2}>
              {props.children}
            </Box>
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}

export interface ConfigTabProps {
  
  data: GlobalData,
  musicSelection: MusicSelectionMap,
  playingOrder: Array<CharacterId>,
  currentCharacterId: CharacterId,
  
  setGlobalData: Dispatch<React.SetStateAction<GlobalData>>,
  setMusicSelection: (selection: MusicSelectionMap) => void,
  setPlayingOrder: (order: Array<CharacterId>) => void,
  setCurrentCharacterId: (charId: CharacterId) => void,

}

export default function ConfigTab(props: ConfigTabProps) {
  const [musicSourceKey, setMusicSourceKey] = useState(DefaultMusicSource.key);
  const [focusedPreset, setFocusedPreset] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>("");
  const prng = new PagePRNG();
  const cardExampleSources: string[] = [];
  const sourcePool = new Array<string>();
  props.data.characterConfigs.forEach((config) => {
    config.card.forEach((card) => {
      sourcePool.push(card);
    });
  });
  for (let i = 0; i < 3; i++) {
    const index = prng.next() % sourcePool.length;
    cardExampleSources.push(sourcePool[index]);
  }
  const presets: Map<string, MusicSelectionMap> = new Map();
  // add presets from default and tags
  { // default
    const selectionMap: MusicSelectionMap = new Map();
    props.data.characterConfigs.forEach((config, charId) => {
      selectionMap.set(charId, 0);
    });
    presets.set("Default", selectionMap);
  }
  { // already
    props.data.presets.forEach((selectionMap, name) => {
      presets.set(name, selectionMap);
    });
  } 
  { // tags
    const tagsSet: Set<string> = new Set();
    props.data.characterConfigs.forEach((config) => {
      config.tags.forEach((tag) => {
        tagsSet.add(tag);
      });
    });
    tagsSet.forEach((tag) => {
      const selectionMap: MusicSelectionMap = new Map();
      props.data.characterConfigs.forEach((config, charId) => {
        if (config.tags.includes(tag)) {
          selectionMap.set(charId, -1);
        }
      });
      presets.set(`Disable ${tag}`, selectionMap);
    }); 
  }

  const applyMusicSelectionPreset = (selectionMap: MusicSelectionMap) => {
    const newMusicSelection: MusicSelectionMap = new Map(props.musicSelection);
    selectionMap.forEach((musicId, charId) => {
      newMusicSelection.set(charId, musicId);
    });

    // update playingorder if something is set to -1
    let changed = false;
    const newPlayingOrder = props.playingOrder.filter((charId) => {
      if (newMusicSelection.has(charId) && newMusicSelection.get(charId) === -1) {
        changed = true;
        return false;
      }
      return true;
    });
    // if something is not -1 but not in playing order, add to the end
    selectionMap.forEach((musicId, charId) => {
      if (musicId !== -1 && !newPlayingOrder.includes(charId)) {
        newPlayingOrder.push(charId);
        changed = true;
      }
    });
    props.setMusicSelection(newMusicSelection);
    if (changed) {
      props.setPlayingOrder(newPlayingOrder);
    }
    // if currentPlayingCharacter is disabled, set to ""
    if (newMusicSelection.has(props.currentCharacterId) && newMusicSelection.get(props.currentCharacterId) === -1) {
      props.setCurrentCharacterId("");
    }
  }

  let searched = false;

  return (
    <Box
      sx={{width: "100%", display: "flex", justifyContent: "center"}}
    >
      <Stack 
        direction="column" spacing={1}
        sx={{
          width: "100%",
          maxWidth: "800px",
          alignItems: "center",
          justifyContent: "center",
          alignContent: "center",
        }}
      >
        <ConfigDrawer title="Card Collection">
          <Stack direction="column" spacing={1}
            sx={{width: "100%"}}
          >
            {CardCollections.map((collection, index) => {
              const [key, element] = collection;
              return (
                <Stack direction="column" width="100%" key={key} spacing={1}>
                  {index !== 0 && <Divider />}
                  <Grid container spacing={1} width="100%">
                    <Grid size={8} sx={{display: "flex", alignItems: "center"}}>
                      <Typography variant="body2">
                        {key}
                      </Typography>
                    </Grid>
                    <Grid size={4} sx={{display: "flex", justifyContent: "flex-end", alignItems: "center"}}>
                      <Button
                        variant={props.data.cardCollection === key ? "contained" : "outlined"}
                        onClick={() => {
                          props.setGlobalData((data) => {
                            data.cardCollection = key;
                            return data.reconstruct();
                          });
                        }}
                        sx={{
                          height: "2em"
                        }}
                      >
                        {props.data.cardCollection === key ? "Selected" : "Select"}
                      </Button>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="body2" color="textSecondary">
                        {element}
                      </Typography>
                    </Grid>
                    <Grid size={6}>
                      <Stack direction="row" spacing={1} justifyContent="space-between" padding={1}>
                        {cardExampleSources.map((source, idx) => (
                          <CharacterCard
                            key={idx}
                            cardCollection={key}
                            width="30%"
                            imageSource={source}
                          />
                        ))}
                      </Stack>
                    </Grid>
                  </Grid>
                </Stack>
              );
            })}
          </Stack>
        </ConfigDrawer>
        <ConfigDrawer title="Music Sources">
          <Stack direction="column" spacing={1}
            sx={{width: "100%"}}
          >
            {MusicSources.map((source, index) => {
              const {key, url, description} = source;
              // grid: (1-row) title, button (2-row): description
              return (
                <Stack direction="column" width="100%" key={key} spacing={1} paddingBottom={1}>
                  {index !== 0 && <Divider />}
                  <Grid container spacing={1} width="100%">
                    <Grid size={8} sx={{display: "flex", alignItems: "center"}}>
                      <Typography variant="body2">
                        {key}
                      </Typography>
                    </Grid>
                    <Grid size={4} sx={{display: "flex", justifyContent: "flex-end", alignItems: "center"}}>
                      <Button
                        variant={musicSourceKey === key ? "contained" : "outlined"}
                        onClick={() => {
                          const fetchJson = async (path: string) => {
                            const resp = await fetch(path);
                            return resp.json();
                          };
                          fetchJson(url).then((jsonData) => {
                            setMusicSourceKey(key);
                            props.setGlobalData((data) => {
                              data.applyFetchedSources(jsonData);
                              return data.reconstruct();
                            });
                          });
                        }}
                        sx={{
                          height: "2em"
                        }}
                      >
                        {musicSourceKey === key ? "Selected" : "Select"}
                      </Button>
                    </Grid>
                    <Grid size={12}>
                      <Typography variant="body2" color="textSecondary">
                        {description}
                      </Typography>
                    </Grid>
                  </Grid>
                </Stack>
              );
            })}
          </Stack>
        </ConfigDrawer>
        <ConfigDrawer title="Music Selection Presets">
          <Stack direction="column" spacing={1}
            sx={{width: "100%"}}
          >
            {Array.from(presets).map(([name, selectionMap], index) => {
              let fullyApplied = true;
              let partiallyApplied = false;
              for (const [charId, musicId] of Array.from(selectionMap)) {
                if (props.musicSelection.get(charId) !== musicId) {
                  fullyApplied = false;
                } else {
                  partiallyApplied = true;
                }
              }
              const icon = fullyApplied ? <FullIcon fontSize="small"/> : (partiallyApplied ? <PartialIcon fontSize="small"/> : <NoneIcon fontSize="small"/>);
              const setFocused = () => {
                if (focusedPreset === name) {
                  setFocusedPreset(null);
                } else {
                  setFocusedPreset(name);
                }
              }
              return (
                <Stack direction="column" width="100%" key={name} spacing={0} onClick={setFocused}>
                  <Grid container width="100%" >
                    <Grid size={8} sx={{display: "flex", alignItems: "center"}}>
                      <Typography variant="body2" sx={{display: "flex", alignItems: "center", gap: 0.5}} fontFamily={NoFontFamily}>
                        {icon}
                        {name}
                      </Typography>
                    </Grid>
                    <Grid size={4} sx={{display: "flex", justifyContent: "flex-end", alignItems: "center"}}>
                      <Button
                        size="small"
                        disabled={fullyApplied}
                        variant={"outlined"}
                        onClick={() => {
                          applyMusicSelectionPreset(selectionMap);
                        }}
                        sx={{
                          height: "2em"
                        }}
                      >
                        Apply
                      </Button>
                    </Grid>
                  </Grid>
                  <Collapse in={focusedPreset === name}>
                    <Stack direction="column" spacing={0} paddingLeft={3}>
                      {Array.from(selectionMap).map(([charId, musicId]) => {
                        const applied = props.musicSelection.get(charId) === musicId;
                        const icon = applied ? <FullIcon fontSize="small"/> : <NoneIcon fontSize="small"/>;
                        let musicName = "Disabled";
                        if (musicId != -1) {
                          const nameId = props.data.characterConfigs.get(charId)?.musics[musicId];
                          if (nameId) {
                            const musicInfo = getMusicInfo(nameId);
                            if (musicInfo) {
                              musicName = musicInfo.title;
                            }
                          }
                        }
                        return (
                          <Stack direction="row" spacing={1} key={name + charId} alignItems="center">
                            <Typography variant="body2" color="textSecondary" fontSize="small">
                              {icon}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              {charId} {"⇒"} {musicName}
                            </Typography>
                          </Stack>
                        );
                      })}
                    </Stack>
                  </Collapse>
                </Stack>
              );
            })}
          </Stack>
        </ConfigDrawer>
        <ConfigDrawer title="Music Selection Single">
          <Stack direction="column" spacing={1}
            sx={{width: "100%"}}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Search fontSize="small" />
              <TextField fullWidth variant="filled" size="small" label="Search Character"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                }}
                slotProps={{ input: { 
                  style: { 
                    fontFamily: NoFontFamily 
                  }
                }}}
              />
            </Stack>
            <Divider />
            {Array.from(props.data.characterConfigs).map(([charId, config]) => {
              if (searchText !== "") {
                if (!charId.toLowerCase().includes(searchText.toLowerCase())) {
                  return null;
                }
              }
              searched = true;
              const selectedMusicId = props.musicSelection.get(charId) ?? 0;
              return (
                <Stack direction="row" spacing={1} key={charId} alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" width="30%" noWrap textAlign="right">
                    {charId}
                  </Typography>
                  <FormControl size="small" sx={{width: "70%"}}>
                    <Select
                      size="small"
                      value={selectedMusicId}
                      onChange={(e) => {
                        const newMusicId = e.target.value as number;
                        const change = new Map<CharacterId, number>();
                        change.set(charId, newMusicId);
                        applyMusicSelectionPreset(change);
                      }}
                    >
                      <MenuItem value={-1}>
                        <Typography variant="body2">Disable</Typography>
                      </MenuItem>
                      {config.musics.map((musicNameId, index) => {
                        const musicInfo = getMusicInfo(musicNameId);
                        let displayTitle = musicNameId;
                        if (musicInfo) {
                          displayTitle = musicInfo.title;
                        }
                        return (
                          <MenuItem value={index} key={musicNameId}>
                            <Typography variant="body2">{displayTitle} ({musicInfo.album})</Typography>
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </Stack>
              );
            })}
            {!searched && (
              <Typography variant="body2" color="textSecondary">
                No character matched the search.
              </Typography>
            )}
          </Stack>
        </ConfigDrawer>
      </Stack>
    </Box>
  );
}
