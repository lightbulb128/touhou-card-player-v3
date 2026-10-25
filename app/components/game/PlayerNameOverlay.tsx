"use client";

import { Typography } from "@mui/material";
import { CustomColors } from "../../types/Consts";
import { GetLocalizedString, Localization } from "../../types/Localization";
import { NoFontFamily } from "../Theme";
import type { BoardLayout } from "../../lib/geometry";
import type { PlayerNamePlates } from "./playerNamePlates";
import { playerNamePlateVisibility } from "./playerNamePlates";

/**
 * The self/opponent name plates above the collected piles. The visibility rules differ
 * between practice, CPU, remote 1v1, melee and observer roles.
 */

export interface PlayerNameOverlayProps {
  layout: BoardLayout;
  /** Seats drawn on the near and far sides; their names are shown when the seat holds a player. */
  plates: PlayerNamePlates;
  /** True when a remote connection is live; observers/clients hide plates without one. */
  connectedToServer: boolean;
  isObserver: boolean;
  isClient: boolean;
  isMelee: boolean;
  isSelectingCards: boolean;
}

export function PlayerNameOverlay({
  layout, plates, connectedToServer,
  isObserver, isClient, isMelee, isSelectingCards,
}: PlayerNameOverlayProps) {
  const { near: showPlayerName, far: showOpponent } = playerNamePlateVisibility({
    layout, plates, connectedToServer, isClient, isObserver, isMelee,
  });

  const selfX = isSelectingCards ? layout.canvasWidth - layout.deckLeft - layout.deckWidth : layout.canvasMargin;
  const opponentX = isSelectingCards ? layout.deckLeft : layout.canvasMargin;

  return (
    <>
      <Typography
        key="player-name-text"
        variant="h6"
        sx={{
          userSelect: "none",
          position: "absolute",
          right: `${selfX}px`,
          top: `${layout.playerNameTop}px`,
          opacity: showPlayerName ? 1.0 : 0.0,
          transition: "right 0.3s ease, top 0.3s ease, opacity 0.3s ease",
          fontFamily: NoFontFamily,
          textAlign: "right",
          width: layout.deckWidth,
          color: isObserver ? CustomColors.opponentColor : CustomColors.selfColor,
        }}
      >
        {GetLocalizedString(Localization.GamePlayer)} {showPlayerName ? plates.near.name : ""}
      </Typography>
      <Typography
        key="opponent-name-text"
        variant="h6"
        sx={{
          userSelect: "none",
          position: "absolute",
          left: `${opponentX}px`,
          top: `${layout.opponentNameTop}px`,
          opacity: showOpponent ? 1.0 : 0.0,
          transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
          fontFamily: NoFontFamily,
          color: CustomColors.opponentColor,
        }}
      >
        {isObserver ? GetLocalizedString(Localization.GamePlayer) : GetLocalizedString(Localization.GameOpponent)}{" "}
        {showOpponent ? plates.far.name : ""}
      </Typography>
    </>
  );
}

/** Height the name plate band needs, used for the canvas extent calculation. */
export function playerNameExtent(layout: BoardLayout): number {
  return layout.playerNameTop + layout.playerNameHeight + layout.canvasMargin;
}
