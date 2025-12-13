import { Box, Button, Collapse, Divider, Grid, IconButton, Paper, Stack, Typography } from "@mui/material";
import { AddRounded, RemoveRounded } from "@mui/icons-material";
import { GlobalData, MusicSelectionMap } from "../types/Configs";
import { Dispatch, useState } from "react";
import { CardCollections, DefaultMusicSource, MusicSources } from "../types/Consts";
import { CharacterCard } from "./CharacterCard";
import { PagePRNG } from "../types/PagePrng";

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
  
  setGlobalData: Dispatch<React.SetStateAction<GlobalData>>,
  setMusicSelection: (selection: MusicSelectionMap) => void,

}

export default function ConfigTab(props: ConfigTabProps) {
  const [musicSourceKey, setMusicSourceKey] = useState(DefaultMusicSource.key);
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
                      <Typography variant="subtitle1" fontWeight="bold">
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
                      >
                        {props.data.cardCollection === key ? "Selected" : "Select"}
                      </Button>
                    </Grid>
                    <Grid size={6}>
                      {element}
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
                      <Typography variant="subtitle1" fontWeight="bold">
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
                      >
                        {musicSourceKey === key ? "Selected" : "Select"}
                      </Button>
                    </Grid>
                    <Grid size={12}>
                      <Typography variant="body2">
                        {description}
                      </Typography>
                    </Grid>
                  </Grid>
                </Stack>
              );
            })}
          </Stack>
        </ConfigDrawer>
      </Stack>
    </Box>
  );
}
