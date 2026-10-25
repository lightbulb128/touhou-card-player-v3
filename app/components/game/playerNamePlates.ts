import type { BoardLayout } from "../../lib/geometry";
import { mapDeckSide } from "../../lib/geometry";
import type { PlayerInfo } from "../../types/GameTypes";

/** The player occupying one side of the board, or nobody when the seat is empty. */
export interface PlayerNameSeat {
  name: string;
  /** Empty seats and spectator seats hold no player, so they get no name plate. */
  isObserver: boolean;
}

export interface PlayerNamePlates {
  /** Seat whose collected pile is drawn on the near side. */
  near: PlayerNameSeat;
  /** Seat whose collected pile is drawn on the far side. */
  far: PlayerNameSeat;
}

function seatOf(player: Pick<PlayerInfo, "name" | "isObserver"> | undefined): PlayerNameSeat {
  return { name: player?.name ?? "", isObserver: player?.isObserver ?? true };
}

export interface PlayerNamePlatesInput {
  layout: Pick<BoardLayout, "selfOnNearSide">;
  players: ReadonlyArray<Pick<PlayerInfo, "name" | "isObserver">>;
  /** More than two active players: every other player shares the far side, so nobody owns it. */
  isMelee: boolean;
  /** Local player index; the near side holds their own pile in a melee. */
  myPlayerIndex: number;
}

/**
 * The two name plates label the piles drawn beside them, so they follow the same near/far
 * mirroring as the cards: a client or an observer has player 1's deck on the near side, which is
 * why an observer must never see their own name there. In a melee the near pile is always the
 * local player's own, so the near seat is the local slot instead of a fixed deck side.
 */
export function playerNamePlates({
  layout, players, isMelee, myPlayerIndex,
}: PlayerNamePlatesInput): PlayerNamePlates {
  return {
    near: seatOf(players[isMelee ? myPlayerIndex : mapDeckSide(0, layout.selfOnNearSide)]),
    // The far side of a melee is a row of opponents, not a single deck.
    far: seatOf(isMelee ? undefined : players[mapDeckSide(1, layout.selfOnNearSide)]),
  };
}

export interface PlayerNamePlateVisibilityInput {
  layout: Pick<BoardLayout, "showPlayerName" | "showOpponentName" | "is1v1">;
  plates: PlayerNamePlates;
  /** True when a remote connection is live; clients/observers hide the opponent plate without one. */
  connectedToServer: boolean;
  isClient: boolean;
  isObserver: boolean;
  isMelee: boolean;
}

export interface PlayerNamePlateVisibility {
  near: boolean;
  far: boolean;
}

/**
 * A plate is only shown when its seat holds a player and the local role can see that side of the
 * board. Spectator and empty seats never show a name, so an observer's own name cannot leak onto
 * a player's plate.
 */
export function playerNamePlateVisibility({
  layout, plates, connectedToServer, isClient, isObserver, isMelee,
}: PlayerNamePlateVisibilityInput): PlayerNamePlateVisibility {
  const near = layout.showPlayerName
    && !(isMelee && isObserver)
    && !(isObserver && !connectedToServer)
    && !plates.near.isObserver;
  // The far plate only exists in a 1v1: with more active players the far side is not one person.
  const far = layout.showOpponentName
    && layout.is1v1
    && !(!connectedToServer && (isClient || isObserver))
    && !plates.far.isObserver;
  return { near, far };
}
