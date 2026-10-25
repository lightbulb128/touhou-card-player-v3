import { describe, expect, it } from "vitest";
import { computeBoardLayout } from "../../lib/geometry";
import type { BoardLayoutInput } from "../../lib/geometry";
import { createTestOuterRef, createTestPeer } from "../../test/fixtures";
import type { Event } from "../../types/GameEvents";
import { GameJudge } from "../../types/GameJudge";
import { MatchType } from "../../types/GameTypes";
import { playerNamePlateVisibility, playerNamePlates } from "./playerNamePlates";

const server = { name: "Server", isObserver: false };
const client = { name: "Client", isObserver: false };
const watcher = { name: "Watcher", isObserver: true };

const baseInput: BoardLayoutInput = {
  containerWidth: 1000,
  cardWidthPercentage: 0.08,
  deckRows: 3,
  deckColumns: 8,
  isMelee: false,
  isCPU: false,
  isServer: false,
  isServerClientObserver: true,
  isNoOpponent: false,
  isSelectingCards: false,
  isObserver: false,
  players: [server, client],
};

/** Resolves the plates and their visibility exactly like the board does for one local role. */
function platesFor(
  matchType: MatchType,
  input: Partial<BoardLayoutInput> = {},
  connectedToServer = true,
  myPlayerIndex = matchType === MatchType.Server ? 0 : (input.players ?? baseInput.players).length - 1,
) {
  const merged: BoardLayoutInput = { ...baseInput, ...input };
  const layout = computeBoardLayout(merged);
  const plates = playerNamePlates({
    layout, players: merged.players, isMelee: merged.isMelee, myPlayerIndex,
  });
  const visibility = playerNamePlateVisibility({
    layout,
    plates,
    connectedToServer,
    isClient: matchType === MatchType.Client,
    isObserver: matchType === MatchType.Observer,
    isMelee: merged.isMelee,
  });
  return { plates, visibility };
}

describe("playerNamePlates", () => {
  it("labels the server's near deck with the server and the far deck with the client", () => {
    const { plates } = platesFor(MatchType.Server, { isServer: true }, false);

    expect(plates.near.name).toBe("Server");
    expect(plates.far.name).toBe("Client");
  });

  it("mirrors the plates for a client", () => {
    const { plates } = platesFor(MatchType.Client);

    expect(plates.near.name).toBe("Client");
    expect(plates.far.name).toBe("Server");
  });

  it("keeps an observer's own name off the near plate of a live 1v1", () => {
    const { plates } = platesFor(MatchType.Observer, {
      isObserver: true,
      players: [server, client, watcher],
    });

    expect(plates.near.name).toBe("Client");
    expect(plates.far.name).toBe("Server");
  });

  it("marks spectator and empty seats as observer seats", () => {
    const own = platesFor(MatchType.Observer, { isObserver: true, players: [server, watcher] });
    expect(own.plates.near).toEqual({ name: "Watcher", isObserver: true });
    expect(own.plates.far).toEqual({ name: "Server", isObserver: false });

    const waiting = platesFor(MatchType.Server, { isServer: true, players: [server] }, false);
    expect(waiting.plates.far).toEqual({ name: "", isObserver: true });
  });

  it("puts the local player on the near plate in a melee, whoever they are", () => {
    const meleePlayers = [
      server, { name: "P2", isObserver: false }, { name: "P3", isObserver: false },
    ];
    const melee = { isMelee: true, players: meleePlayers };

    // the far side of a melee is a row of opponents, so it has no single owner
    expect(platesFor(MatchType.Server, { ...melee, isServer: true }, false, 0).plates)
      .toEqual({ near: { name: "Server", isObserver: false }, far: { name: "", isObserver: true } });
    expect(platesFor(MatchType.Client, melee, true, 1).plates.near.name).toBe("P2");
    expect(platesFor(MatchType.Client, melee, true, 2).plates.near.name).toBe("P3");
  });
});

describe("playerNamePlateVisibility", () => {
  it("hides both plates in practice and against the CPU", () => {
    const practice: Partial<BoardLayoutInput> = {
      isNoOpponent: true, isServerClientObserver: false, players: [server],
    };
    expect(platesFor(MatchType.None, practice, false).visibility)
      .toEqual({ near: false, far: false });

    const cpu: Partial<BoardLayoutInput> = {
      isCPU: true,
      players: [server, { name: "CPU Opponent", isObserver: false }],
    };
    expect(platesFor(MatchType.CPU, cpu, false).visibility).toEqual({ near: false, far: false });
  });

  it("shows only the server's own plate while it waits for a client", () => {
    const { visibility } = platesFor(MatchType.Server, { isServer: true, players: [server] }, false);

    expect(visibility).toEqual({ near: true, far: false });
  });

  it("shows both plates on a server that has a client", () => {
    expect(platesFor(MatchType.Server, { isServer: true }, false).visibility)
      .toEqual({ near: true, far: true });
  });

  it("hides the far plate when the only remote connection is an observer", () => {
    const { visibility } = platesFor(
      MatchType.Server, { isServer: true, players: [server, watcher] }, false,
    );

    expect(visibility).toEqual({ near: true, far: false });
  });

  it("shows both plates on a client that is connected to the server", () => {
    expect(platesFor(MatchType.Client).visibility).toEqual({ near: true, far: true });
  });

  it("hides the far plate on a client that lost its server", () => {
    expect(platesFor(MatchType.Client, {}, false).visibility).toEqual({ near: true, far: false });
  });

  it("shows both player plates to an observer of a live 1v1", () => {
    const { visibility } = platesFor(MatchType.Observer, {
      isObserver: true,
      players: [server, client, watcher],
    });

    expect(visibility).toEqual({ near: true, far: true });
  });

  it("shows only the server's plate to an observer whose own seat holds no player", () => {
    const { visibility } = platesFor(
      MatchType.Observer, { isObserver: true, players: [server, watcher] },
    );

    expect(visibility).toEqual({ near: false, far: true });
  });

  it("hides both plates for an observer that is not connected", () => {
    const { visibility } = platesFor(
      MatchType.Observer, { isObserver: true, players: [server, client, watcher] }, false,
    );

    expect(visibility).toEqual({ near: false, far: false });
  });

  it("hides the far plate in a melee and both plates for a melee observer", () => {
    const meleePlayers = [
      server, { name: "P2", isObserver: false }, { name: "P3", isObserver: false },
    ];

    expect(platesFor(MatchType.Server, { isServer: true, isMelee: true, players: meleePlayers }, false)
      .visibility).toEqual({ near: true, far: false });
    expect(platesFor(MatchType.Observer, { isObserver: true, isMelee: true, players: meleePlayers })
      .visibility).toEqual({ near: false, far: false });
  });

  it("shows the near plate to every melee client, not just the server", () => {
    const meleePlayers = [
      server, { name: "P2", isObserver: false }, { name: "P3", isObserver: false },
    ];

    expect(platesFor(MatchType.Client, { isMelee: true, players: meleePlayers }, true, 1).visibility)
      .toEqual({ near: true, far: false });
    expect(platesFor(MatchType.Client, { isMelee: true, players: meleePlayers }, true, 2).visibility)
      .toEqual({ near: true, far: false });
  });
});

describe("plates resolved from a broadcast roster", () => {
  /** Builds the board a receiving client/observer gets from the roster the server broadcasts. */
  function remoteBoard(
    matchType: MatchType,
    prepare: (server: GameJudge) => void,
    toIndex = 1,
  ) {
    const peer = createTestPeer();
    const serverJudge = new GameJudge(createTestOuterRef({ peer }));
    serverJudge.matchType = MatchType.Server;
    prepare(serverJudge);
    serverJudge.broadcastNames();

    const sent = peer.recorded.eventsToClient.filter((entry) => entry.to === toIndex);
    const event = sent[sent.length - 1].event as Event;
    const remoteJudge = new GameJudge(createTestOuterRef());
    remoteJudge.matchType = matchType;
    remoteJudge.remoteEventListener(0, event);

    const input: BoardLayoutInput = {
      ...baseInput,
      isObserver: matchType === MatchType.Observer,
      isMelee: remoteJudge.isMelee(),
      players: remoteJudge.players,
    };
    const layout = computeBoardLayout(input);
    const plates = playerNamePlates({
      layout,
      players: remoteJudge.players,
      isMelee: input.isMelee,
      myPlayerIndex: remoteJudge.myPlayerIndex,
    });
    const visibility = playerNamePlateVisibility({
      layout,
      plates,
      connectedToServer: true,
      isClient: matchType === MatchType.Client,
      isObserver: input.isObserver,
      isMelee: input.isMelee,
    });
    return { plates, visibility };
  }

  it("shows the client near and the server far when a spectator joins a live 1v1", () => {
    const { plates, visibility } = remoteBoard(MatchType.Observer, (serverJudge) => {
      serverJudge.players[0].name = "Server";
      serverJudge.addPlayer("Client", true);
      serverJudge.players[1].isObserver = false;
      serverJudge.addPlayer();
      serverJudge.players[2].name = "Watcher";
    });

    expect(plates).toEqual({
      near: { name: "Client", isObserver: false },
      far: { name: "Server", isObserver: false },
    });
    expect(visibility).toEqual({ near: true, far: true });
  });

  it("keeps a spectator's own name off the board when no client has joined yet", () => {
    const { plates, visibility } = remoteBoard(MatchType.Observer, (serverJudge) => {
      serverJudge.players[0].name = "Server";
      serverJudge.addPlayer();
      serverJudge.players[1].name = "Watcher";
    });

    expect(plates).toEqual({
      near: { name: "Watcher", isObserver: true },
      far: { name: "Server", isObserver: false },
    });
    expect(visibility).toEqual({ near: false, far: true });
  });

  it("gives each melee client their own name on the near plate", () => {
    const prepare = (serverJudge: GameJudge) => {
      serverJudge.players[0].name = "Server";
      serverJudge.addPlayer("P2", true);
      serverJudge.players[1].isObserver = false;
      serverJudge.addPlayer("P3", true);
      serverJudge.players[2].isObserver = false;
    };

    // a melee client is player 2, not the server who owns deck 0
    const { plates, visibility } = remoteBoard(MatchType.Client, prepare, 2);

    expect(plates).toEqual({
      near: { name: "P3", isObserver: false },
      far: { name: "", isObserver: true },
    });
    expect(visibility).toEqual({ near: true, far: false });
  });

  it("keeps a melee spectator's own name off both plates", () => {
    const prepare = (serverJudge: GameJudge) => {
      serverJudge.players[0].name = "Server";
      serverJudge.addPlayer("P2", true);
      serverJudge.players[1].isObserver = false;
      serverJudge.addPlayer("P3", true);
      serverJudge.players[2].isObserver = false;
      serverJudge.addPlayer("Watcher");
    };

    const { plates, visibility } = remoteBoard(MatchType.Observer, prepare, 3);

    // the roster names every player in the per-pile labels instead, so no plate is shown
    expect(plates).toEqual({
      near: { name: "Watcher", isObserver: true },
      far: { name: "", isObserver: true },
    });
    expect(visibility).toEqual({ near: false, far: false });
  });
});
