import { Box, Stack, Typography } from "@mui/material";
import { CharacterId } from "../types/Configs";
import { CharacterCardStacked } from "./CharacterCard";

export interface MusicCardDisplayProps {
  cardCollection: string;
  cardSources: string[];
  title: string;
  album: string;
  characterId: CharacterId;
  expanded?: boolean;
}

function MusicCardDisplay({
  cardCollection,
  cardSources, title, album, characterId, expanded,
}: MusicCardDisplayProps) {
  const typographySx = {
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
  }
  return <Box
    sx={{
      width: "100%",
    }}
  >
    <Stack direction="column" spacing={1}>
      <Stack direction="column" spacing={0} alignItems="center">
        <Typography sx={{...typographySx, fontSize: "clamp(1em, 1.5em, 3vw)"}}>
          {title}
        </Typography>
        <Typography sx={{...typographySx, fontSize: "clamp(0.8em, 1.2em, 2.4vw)", color: "text.secondary" }}>
          {album}
        </Typography>
        <Typography sx={{...typographySx, fontSize: "clamp(0.8em, 1.2em, 2.4vw)", color: "text.secondary" }}>
          {characterId}
        </Typography>
      </Stack>
      <Box
        sx={{
          width: "100%",
          justifyContent: "center",
        }}
      >
        <CharacterCardStacked
          cardCollection={cardCollection}
          imageSources={cardSources}
          expanded={expanded}
          raised={false}
          sx={{
            width: "100%",
            // backgroundColor: "#aa0000"
          }}
          stackSx={{
            maxWidth: "750px",
            // backgroundColor: "#aaaa00",
            width: "100%",
          }}
          boxSx={{
            width: "30%",
          }}
        />
      </Box>
    </Stack>
  </Box>
}

export default MusicCardDisplay;