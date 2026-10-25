import { CardInfo, PlayerInfo } from "../../types/GameTypes";

export interface LocalWaitingRosterInput {
  players: ReadonlyArray<PlayerInfo>;
  /** Seat the local player occupies in the roster being replaced. */
  myPlayerIndex: number;
  /** A client keeps a deck it can fill while waiting; an observer does not need one. */
  fillLocalDeck: boolean;
  /** Cards in a fresh deck, `deckRows * deckColumns`. */
  deckSize: number;
}

export interface LocalWaitingRoster {
  players: Array<PlayerInfo>;
  myPlayerIndex: number;
}

function emptyDeck(size: number): Array<CardInfo> {
  return Array.from({ length: size }, () => new CardInfo(null, 0));
}

/**
 * Rebuilds the two-seat roster a client or observer holds while it has no server.
 *
 * Only the local name survives: `myPlayerIndex` is the local seat, and in a melee slot 1 can
 * belong to a different client, so copying the old prefix would rename the local seat after a
 * departed player and announce that name to the next server.
 */
export function localWaitingRoster({
  players, myPlayerIndex, fillLocalDeck, deckSize,
}: LocalWaitingRosterInput): LocalWaitingRoster {
  const selfName = players[myPlayerIndex]?.name ?? "";
  return {
    players: [
      // slot 0 is the server seat; it only carries the local name until the next broadcast
      { ...players[0], name: selfName, deck: emptyDeck(deckSize) },
      {
        name: selfName,
        isObserver: false,
        deck: fillLocalDeck ? emptyDeck(deckSize) : [],
        collected: [],
        confirmation: { start: false, next: false },
      },
    ],
    myPlayerIndex: 1,
  };
}
