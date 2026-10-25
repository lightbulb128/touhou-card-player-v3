import { describe, expect, it } from "vitest";
import { CardInfo, PlayerInfo } from "../../types/GameTypes";
import { MatchType } from "../../types/GameTypes";
import { GameJudge } from "../../types/GameJudge";
import type { Event, EventNotifyName, EventSyncSettings } from "../../types/GameEvents";
import { createTestOuterRef, createTestPeer } from "../../test/fixtures";
import { localWaitingRoster } from "./localRoster";

function player(name: string, isObserver = false, collected: Array<CardInfo> = []): PlayerInfo {
  return { name, isObserver, collected, deck: [], confirmation: { start: false, next: false } };
}

const deckSize = 24;

describe("localWaitingRoster", () => {
  it("keeps the local name when the local seat is slot 1", () => {
    const { players, myPlayerIndex } = localWaitingRoster({
      players: [player("Server"), player("Client")],
      myPlayerIndex: 1,
      fillLocalDeck: true,
      deckSize,
    });

    expect(myPlayerIndex).toBe(1);
    expect(players[1].name).toBe("Client");
  });

  it("keeps an observer's own name instead of the client that sat in slot 1", () => {
    const { players, myPlayerIndex } = localWaitingRoster({
      players: [player("Server"), player("Client"), player("Watcher", true)],
      myPlayerIndex: 2,
      fillLocalDeck: false,
      deckSize,
    });

    expect(myPlayerIndex).toBe(1);
    // "Client" has left with the server, so its name must not survive in the local slot
    expect(players.map((entry) => entry.name)).toEqual(["Watcher", "Watcher"]);
    expect(players.some((entry) => entry.name === "Client")).toBe(false);
  });

  it("keeps a melee client's own name when other clients sat ahead of it", () => {
    const { players } = localWaitingRoster({
      players: [player("Server"), player("P2"), player("P3"), player("Watcher", true)],
      myPlayerIndex: 2,
      fillLocalDeck: true,
      deckSize,
    });

    expect(players[1].name).toBe("P3");
    expect(players.some((entry) => entry.name === "P2" || entry.name === "Server")).toBe(false);
  });

  it("produces two seats with fresh decks and no collected cards", () => {
    const { players } = localWaitingRoster({
      players: [
        player("Server", false, [new CardInfo("alice", 0)]),
        player("Client", false, [new CardInfo("marisa", 0)]),
      ],
      myPlayerIndex: 1,
      fillLocalDeck: true,
      deckSize,
    });

    expect(players).toHaveLength(2);
    expect(players.every((entry) => !entry.isObserver)).toBe(true);
    for (const seat of players) {
      expect(seat.deck).toHaveLength(deckSize);
      expect(seat.deck.every((card) => card.characterId === null)).toBe(true);
    }
    // the departed server's collected card is not carried over
    expect(players[0].collected).toEqual([new CardInfo("alice", 0)]);
  });

  it("leaves the local deck empty for an observer", () => {
    const { players } = localWaitingRoster({
      players: [player("Server"), player("Client"), player("Watcher", true)],
      myPlayerIndex: 2,
      fillLocalDeck: false,
      deckSize,
    });

    expect(players[1].deck).toEqual([]);
    // the server seat still gets an empty grid so the far deck keeps its shape
    expect(players[0].deck).toHaveLength(deckSize);
  });
});

describe("reconnecting after the server dropped", () => {
  /** Feeds the roster one observer received from a server that then went away. */
  function connectedObserver() {
    const peer = createTestPeer();
    const server = new GameJudge(createTestOuterRef({ peer }));
    server.matchType = MatchType.Server;
    server.players[0].name = "Server";
    server.addPlayer("P2", true);
    server.players[1].isObserver = false;
    server.addPlayer("Watcher");
    server.broadcastNames();

    const sent = peer.recorded.eventsToClient.filter((entry) => entry.to === 2);
    const remotePeer = createTestPeer();
    const remote = new GameJudge(createTestOuterRef({ peer: remotePeer }));
    remote.matchType = MatchType.Observer;
    remote.remoteEventListener(0, sent[sent.length - 1].event as Event);
    return { remote, remotePeer };
  }

  it("announces its own name, not the client that sat in slot 1", () => {
    const { remote, remotePeer } = connectedObserver();
    expect(remote.players[remote.myPlayerIndex].name).toBe("Watcher");

    // what the board does when the connection drops
    const waiting = localWaitingRoster({
      players: remote.players,
      myPlayerIndex: remote.myPlayerIndex,
      fillLocalDeck: false,
      deckSize: remote.deckRows * remote.deckColumns,
    });
    remote.players = waiting.players;
    remote.myPlayerIndex = waiting.myPlayerIndex;
    remote.resetNonServerState();

    // the next server greets it with fresh settings, which makes it announce itself
    remote.remoteEventListener(0, {
      type: "syncSettings",
      traditionalMode: true,
      randomStartPosition: false,
      playbackDuration: 0,
      deckColumns: remote.deckColumns,
      deckRows: remote.deckRows,
    } as EventSyncSettings);
    const notifyName = remotePeer.recorded.eventsToServer
      .filter((event) => (event as Event).type === "notifyName")
      .pop() as EventNotifyName;
    expect(notifyName.name).toBe("Watcher");
    expect(notifyName.isObserver).toBe(true);

    // and the new server registers that name on the observer seat
    const nextServer = new GameJudge(createTestOuterRef());
    nextServer.matchType = MatchType.Server;
    nextServer.addPlayer();
    nextServer.remoteEventListener(1, notifyName);

    expect(nextServer.players[1].name).toBe("Watcher");
  });
});
