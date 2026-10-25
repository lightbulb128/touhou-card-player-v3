import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CardInfo, GameJudge, GameJudgeState, MatchType, PickEvent,
} from "./GameJudge";
import type { SendOption } from "./GameJudge";
import { createTestGlobalData, createTestOuterRef, createTestPeer } from "../test/fixtures";

const DontSend: SendOption = { send: false, except: null };

function newJudge(options: Parameters<typeof createTestOuterRef>[0] = {}) {
  const outerRef = createTestOuterRef(options);
  const judge = new GameJudge(outerRef);
  return { judge, outerRef, calls: outerRef.calls };
}

function fillDeckWith(judge: GameJudge, entries: Record<number, CardInfo>) {
  for (const [index, cardInfo] of Object.entries(entries)) {
    judge.addToDeck(0, cardInfo, Number(index), DontSend);
  }
}

describe("GameJudge construction", () => {
  it("starts with a single player and an empty 3x8 deck", () => {
    const { judge } = newJudge();

    expect(judge.matchType).toBe(MatchType.None);
    expect(judge.state).toBe(GameJudgeState.SelectingCards);
    expect(judge.players).toHaveLength(1);
    expect(judge.deckRows).toBe(3);
    expect(judge.deckColumns).toBe(8);
    expect(judge.players[0].deck).toHaveLength(24);
    expect(judge.players[0].deck.every((card) => card.characterId === null)).toBe(true);
    expect(judge.players[0].collected).toHaveLength(0);
    expect(judge.players[0].confirmation).toEqual({ start: false, next: false });
    expect(judge.givesLeft).toBe(0);
    expect(judge.clientWaitAcknowledge).toBe(false);
  });

  it("is a mutable model whose nested state stays shared across readers", () => {
    const { judge } = newJudge();
    const reader = judge;

    judge.addPlayer("Watcher");

    // Everyone holding the judge sees the mutation; React is nudged separately (judgeVersion).
    expect(reader.players).toHaveLength(2);
    expect(reader.players).toBe(judge.players);
  });
});

describe("GameJudge deck operations", () => {
  it("adds to the first empty slot when toIndex is null", () => {
    const { judge } = newJudge();
    const alice = new CardInfo("alice", 0);

    expect(judge.addToDeck(0, alice, null, DontSend)).toBe(true);
    expect(judge.getDeck(0, 0)).toBe(alice);
    expect(judge.getDeck(0, 1)).toBeNull();
  });

  it("adds to an explicit slot", () => {
    const { judge } = newJudge();
    expect(judge.addToDeck(0, new CardInfo("alice", 0), 7, DontSend)).toBe(true);
    expect(judge.getDeck(0, 7)?.characterId).toBe("alice");
    expect(judge.getDeck(0, 0)).toBeNull();
  });

  it("refuses a card that is already in a deck", () => {
    const { judge } = newJudge();
    expect(judge.addToDeck(0, new CardInfo("alice", 0), null, DontSend)).toBe(true);
    expect(judge.addToDeck(0, new CardInfo("alice", 0), null, DontSend)).toBe(false);
    expect(judge.getDeckCardCount(0)).toBe(1);
  });

  it("refuses a card that is already collected", () => {
    const { judge } = newJudge();
    judge.players[0].collected.push(new CardInfo("alice", 0));
    expect(judge.addToDeck(0, new CardInfo("alice", 0), null, DontSend)).toBe(false);
  });

  it("refuses to add when the deck is full", () => {
    const { judge } = newJudge();
    for (let i = 0; i < 24; i++) {
      expect(judge.addToDeck(0, new CardInfo(`char-${i}`, 0), null, DontSend)).toBe(true);
    }
    expect(judge.isDeckFull(0)).toBe(true);
    expect(judge.addToDeck(0, new CardInfo("overflow", 0), null, DontSend)).toBe(false);
  });

  it("distinguishes cards of the same character by cardIndex", () => {
    const { judge } = newJudge();
    expect(judge.addToDeck(0, new CardInfo("alice", 0), null, DontSend)).toBe(true);
    expect(judge.addToDeck(0, new CardInfo("alice", 1), null, DontSend)).toBe(true);
    expect(judge.getDeckCardCount(0)).toBe(2);
  });

  it("reports empty/full/count helpers consistently", () => {
    const { judge } = newJudge();
    expect(judge.isDeckEmpty(0)).toBe(true);
    expect(judge.isDeckFull(0)).toBe(false);
    expect(judge.getDeckEmptyCount(0)).toBe(24);
    expect(judge.getDeckCardCount(0)).toBe(0);
    expect(judge.findFirstNullIndexInDeck(0)).toBe(0);

    fillDeckWith(judge, { 0: new CardInfo("alice", 0), 1: new CardInfo("marisa", 0) });
    expect(judge.getDeckCardCount(0)).toBe(2);
    expect(judge.getDeckEmptyCount(0)).toBe(22);
    expect(judge.isDeckEmpty(0)).toBe(false);
    expect(judge.findFirstNullIndexInDeck(0)).toBe(2);
  });

  it("removeFromDeck clears the slot and reports whether it changed", () => {
    const { judge } = newJudge();
    judge.addToDeck(0, new CardInfo("alice", 0), 3, DontSend);

    expect(judge.removeFromDeck(0, 3, DontSend)).toBe(true);
    expect(judge.getDeck(0, 3)).toBeNull();
    expect(judge.removeFromDeck(0, 3, DontSend)).toBe(false);
    expect(judge.removeFromDeck(0, 999, DontSend)).toBe(false);
  });

  it("getDeck returns null for empty slots and out-of-range indices", () => {
    const { judge } = newJudge();
    expect(judge.getDeck(0, 0)).toBeNull();
    expect(judge.getDeck(0, -1)).toBeNull();
    expect(judge.getDeck(0, 24)).toBeNull();
  });

  it("clearDeck empties the deck and only reports a change once", () => {
    const { judge } = newJudge();
    fillDeckWith(judge, {
      0: new CardInfo("alice", 0),
      5: new CardInfo("marisa", 0),
      10: new CardInfo("reimu", 0),
    });

    expect(judge.clearDeck(0, DontSend)).toBe(true);
    expect(judge.getDeckCardCount(0)).toBe(0);
    expect(judge.getDeck(0, 5)).toBeNull();
    expect(judge.clearDeck(0, DontSend)).toBe(false);
  });

  it("shuffleDeck preserves the set of cards while moving them", () => {
    const { judge } = newJudge();
    const cards = [
      new CardInfo("alice", 0), new CardInfo("alice", 1),
      new CardInfo("marisa", 0), new CardInfo("reimu", 0),
    ];
    cards.forEach((card, index) => judge.addToDeck(0, card, index * 2, DontSend));

    judge.shuffleDeck(0, DontSend);

    const after = judge.players[0].deck.filter((card) => card.characterId !== null);
    expect(after).toHaveLength(cards.length);
    expect(new Set(after.map((card) => card.toKey()))).toEqual(
      new Set(cards.map((card) => card.toKey())),
    );
  });

  it("shuffleDeck keeps every card inside the deck bounds", () => {
    const { judge } = newJudge();
    for (let i = 0; i < 24; i++) {
      judge.addToDeck(0, new CardInfo(`char-${i}`, 0), null, DontSend);
    }
    judge.shuffleDeck(0, DontSend);
    expect(judge.getDeckCardCount(0)).toBe(24);
    expect(judge.players[0].deck).toHaveLength(24);
  });

  it("randomFillDeck fills empty slots with unique characters", () => {
    const globalData = createTestGlobalData();
    const playingOrder = ["alice", "marisa", "reimu", "youmu"];
    const { judge } = newJudge({ globalData, playingOrder });

    judge.randomFillDeck(0, DontSend);

    // only 4 characters exist, so only 4 cards can be placed
    expect(judge.getDeckCardCount(0)).toBe(4);
    const characterIds = judge.players[0].deck
      .filter((card) => card.characterId !== null)
      .map((card) => card.characterId);
    expect(new Set(characterIds).size).toBe(characterIds.length);
    for (const characterId of characterIds) {
      expect(playingOrder).toContain(characterId);
    }
  });

  it("randomFillDeck does not restrict itself to a stale playing order", () => {
    // the board offers every character in the selecting phase, and starting a match rebuilds the
    // order anyway, so a short/stale order must not shrink what Random Fill can place
    const { judge } = newJudge({ playingOrder: ["alice"] });

    judge.randomFillDeck(0, DontSend);

    const characterIds = new Set(
      judge.players[0].deck.filter((card) => card.characterId !== null).map((card) => card.characterId),
    );
    expect(characterIds.size).toBe(4);
    expect(characterIds.has("marisa")).toBe(true);
  });

  it("randomFillDeck skips characters whose soundtrack is disabled", () => {
    const globalData = createTestGlobalData();
    const musicSelection = new Map<string, number>([
      ["alice", 0], ["marisa", -1], ["reimu", 0], ["youmu", -1],
    ]);
    const outerRef = createTestOuterRef({ globalData, musicSelection });
    const judge = new GameJudge(outerRef);

    judge.randomFillDeck(0, DontSend);

    const characterIds = judge.players[0].deck
      .filter((card) => card.characterId !== null)
      .map((card) => card.characterId);
    expect(new Set(characterIds)).toEqual(new Set(["alice", "reimu"]));
  });

  it("randomFillDeck does not duplicate characters already in another deck", () => {
    const { judge } = newJudge();
    judge.addToDeck(0, new CardInfo("alice", 0), null, DontSend);

    judge.randomFillDeck(0, DontSend);

    const aliceCards = judge.players[0].deck.filter((card) => card.characterId === "alice");
    expect(aliceCards).toHaveLength(1);
  });

  it("randomFillDeck leaves collected characters alone", () => {
    const { judge } = newJudge();
    judge.addPlayer("P1", true);
    judge.players[0].collected.push(new CardInfo("alice", 0));

    judge.randomFillDeck(0, DontSend);

    const characterIds = judge.players[0].deck
      .filter((card) => card.characterId !== null)
      .map((card) => card.characterId);
    expect(characterIds).not.toContain("alice");
    expect(characterIds).toHaveLength(3);
  });

  it("randomFillDeck keeps filling when a candidate is refused", () => {
    const { judge } = newJudge();
    const addToDeck = vi.spyOn(judge, "addToDeck");
    // refuse the very first candidate: that slot must be taken by the next one
    addToDeck.mockReturnValueOnce(false);

    judge.randomFillDeck(0, DontSend);

    // one refused candidate + three placed cards, and no slot left empty needlessly
    expect(addToDeck).toHaveBeenCalledTimes(4);
    expect(judge.getDeckCardCount(0)).toBe(3);
  });

  it("canRandomFill stops at a full deck or an exhausted character set", () => {
    const { judge } = newJudge();
    expect(judge.canRandomFill(0)).toBe(true);

    for (let i = 0; i < 24; i++) {
      judge.addToDeck(0, new CardInfo(`char-${i}`, 0), null, DontSend);
    }
    expect(judge.isDeckFull(0)).toBe(true);
    expect(judge.canRandomFill(0)).toBe(false);

    // an empty deck whose every character is already collected has nothing left to place
    const collected = newJudge();
    for (const characterId of ["alice", "marisa", "reimu", "youmu"]) {
      collected.judge.players[0].collected.push(new CardInfo(characterId, 0));
    }
    expect(collected.judge.canRandomFill(0)).toBe(false);
    expect(collected.judge.canRandomFill(1)).toBe(false); // no second deck at all
  });

  it("adjustDeckSize grows and shrinks the deck while keeping placed cards", () => {
    const { judge } = newJudge();
    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);

    judge.adjustDeckSize(2, 3, DontSend); // 6 slots
    expect(judge.players[0].deck).toHaveLength(6);
    expect(judge.getDeck(0, 0)?.characterId).toBe("alice");
    expect(judge.getDeckEmptyCount(0)).toBe(5);

    judge.adjustDeckSize(5, 5, DontSend); // 25 slots
    expect(judge.players[0].deck).toHaveLength(25);
    expect(judge.getDeck(0, 0)?.characterId).toBe("alice");
    expect(judge.deckRows).toBe(5);
    expect(judge.deckColumns).toBe(5);
  });

  it("adjustDeckSize truncates cards that no longer fit", () => {
    const { judge } = newJudge();
    judge.addToDeck(0, new CardInfo("alice", 0), 23, DontSend);

    judge.adjustDeckSize(1, 1, DontSend); // single slot

    expect(judge.players[0].deck).toHaveLength(1);
    expect(judge.getDeckCardCount(0)).toBe(0);
  });

  it("moveCard relocates a card and reports failure for empty slots", () => {
    const { judge } = newJudge();
    judge.players.push({ ...judge.players[0] });
    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);

    expect(judge.moveCard(0, 0, 1, 4, DontSend)).toBe(true);
    expect(judge.getDeck(0, 0)).toBeNull();
    expect(judge.getDeck(1, 4)?.characterId).toBe("alice");

    expect(judge.moveCard(0, 0, 1, 5, DontSend)).toBe(false);
  });
});

describe("GameJudge player specification", () => {
  it("resolves null to all players, or to the first two when only01", () => {
    const { judge } = newJudge();
    judge.addPlayer();
    judge.addPlayer();

    expect(judge.playerSpecificationToList(null, false)).toEqual([0, 1, 2]);
    expect(judge.playerSpecificationToList(null, true)).toEqual([0, 1]);
    expect(judge.playerSpecificationToList([0, 1], false)).toEqual([0, 1]);
    expect(judge.playerSpecificationToList(1, false)).toEqual([1]);
    expect(judge.playerSpecificationToList(5, false)).toEqual([]);
    // array entries are validated against a hard-coded 2-player bound, so index 2 is dropped
    expect(judge.playerSpecificationToList([0, 2], false)).toEqual([0]);
  });

  it("builds deck and collected card sets across player subsets", () => {
    const { judge } = newJudge();
    judge.addPlayer();
    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);
    judge.addToDeck(1, new CardInfo("marisa", 0), 0, DontSend);
    judge.players[0].collected.push(new CardInfo("reimu", 0));

    // null resolves to players 0 and 1
    expect(judge.getDeckCardSet(null)).toEqual(new Set(["alice-0", "marisa-0"]));
    expect(judge.getDeckCardSet([0])).toEqual(new Set(["alice-0"]));
    expect(judge.getCollectedCardSet(null)).toEqual(new Set(["reimu-0"]));
    expect(judge.isInDeck(null, new CardInfo("marisa", 0))).toBe(true);
    expect(judge.isInDeck([0], new CardInfo("marisa", 0))).toBe(false);
    expect(judge.isInCollected(null, new CardInfo("reimu", 0))).toBe(true);
    expect(judge.isInCollected(null, new CardInfo("alice", 0))).toBe(false);
  });

  it("isMelee is true only with more than two active players", () => {
    const { judge } = newJudge();
    expect(judge.isMelee()).toBe(false);

    // addPlayer() creates an observer; callers opt players in by flipping the flag
    judge.addPlayer("Opponent", true);
    judge.players[1].isObserver = false;
    expect(judge.isMelee()).toBe(false);

    judge.addPlayer("Third", true);
    judge.players[2].isObserver = false;
    expect(judge.isMelee()).toBe(true);

    judge.addPlayer("Spectator");
    expect(judge.isMelee()).toBe(true);

    judge.players[2].isObserver = true;
    expect(judge.isMelee()).toBe(false);
  });
});

describe("GameJudge pick events", () => {
  it("sortPickEvents orders by timestamp and keeps the earliest pick per character", () => {
    const { judge } = newJudge();
    judge.pickEvents = [
      new PickEvent(30, 1, new CardInfo("alice", 0), { deckIndex: 0, cardIndex: 1 }),
      new PickEvent(10, 0, new CardInfo("alice", 0), { deckIndex: 0, cardIndex: 2 }),
      new PickEvent(20, 1, new CardInfo("marisa", 0), { deckIndex: 1, cardIndex: 3 }),
    ];

    judge.sortPickEvents();

    expect(judge.pickEvents.map((event) => event.timestamp)).toEqual([10, 20]);
    expect(judge.pickEvents.map((event) => event.player)).toEqual([0, 1]);
  });

  it("determines the winner, collects the card and clears it from the deck", () => {
    const { judge, calls } = newJudge({ currentCharacterId: "alice" });
    const winningCard = new CardInfo("alice", 0);
    judge.addToDeck(0, winningCard, 2, DontSend);
    judge.state = GameJudgeState.TurnStart;

    judge.notifyPickEvent(
      new PickEvent(5, 0, winningCard, { deckIndex: 0, cardIndex: 2 }),
      DontSend,
    );

    expect(judge.state).toBe(GameJudgeState.TurnWinnerDetermined);
    expect(judge.turnWinner).toBe(0);
    expect(judge.players[0].collected.map((card) => card.toKey())).toEqual(["alice-0"]);
    expect(judge.getDeck(0, 2)).toBeNull();
    expect(calls.turnWinnerDetermined).toEqual([0]);
  });

  it("keeps waiting when nobody picked the current character", () => {
    const { judge, calls } = newJudge({ currentCharacterId: "alice" });
    const wrongCard = new CardInfo("marisa", 0);
    judge.addToDeck(0, wrongCard, 0, DontSend);
    judge.state = GameJudgeState.TurnStart;

    judge.notifyPickEvent(new PickEvent(5, 0, wrongCard, { deckIndex: 0, cardIndex: 0 }), DontSend);

    expect(judge.state).toBe(GameJudgeState.TurnStart);
    expect(judge.turnWinner).toBeNull();
    expect(judge.players[0].collected).toHaveLength(0);
    expect(judge.getDeck(0, 0)?.characterId).toBe("marisa");
    expect(calls.turnWinnerDetermined).toHaveLength(0);
  });

  it("does not collect the same card twice", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    const card = new CardInfo("alice", 0);
    judge.addToDeck(0, card, 0, DontSend);
    judge.players[0].collected.push(card);

    judge.notifyPickEvent(new PickEvent(5, 0, card, { deckIndex: 0, cardIndex: 0 }), DontSend);

    expect(judge.players[0].collected).toHaveLength(1);
  });
});

describe("GameJudge gives calculation", () => {
  it("never gives cards in single-player practice", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.pickEvents = [new PickEvent(1, 0, new CardInfo("marisa", 0), { deckIndex: 0, cardIndex: 0 })];

    expect(judge.calculateGivesFromPickEvents(0)).toBe(false);
    expect(judge.givesLeft).toBe(0);
  });

  it("never gives cards in non-traditional mode", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.matchType = MatchType.CPU;
    judge.traditionalMode = false;
    judge.pickEvents = [new PickEvent(1, 0, new CardInfo("marisa", 0), { deckIndex: 0, cardIndex: 0 })];

    expect(judge.calculateGivesFromPickEvents(0)).toBe(false);
    expect(judge.givesLeft).toBe(0);
  });

  it("charges one card per wrong pick in traditional 1v1", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.matchType = MatchType.CPU;
    judge.addPlayer();
    // both decks have cards so the clamp does not interfere
    for (let i = 0; i < 4; i++) {
      judge.addToDeck(0, new CardInfo(`p0-${i}`, 0), i, DontSend);
      judge.addToDeck(1, new CardInfo(`p1-${i}`, 0), i, DontSend);
    }
    judge.pickEvents = [
      new PickEvent(1, 0, new CardInfo("marisa", 0), { deckIndex: 0, cardIndex: 0 }),
      new PickEvent(2, 1, new CardInfo("reimu", 0), { deckIndex: 1, cardIndex: 0 }),
    ];

    expect(judge.calculateGivesFromPickEvents(0)).toBe(true);
    // P0 wrong (-1) and P1 wrong (+1) cancel out
    expect(judge.givesLeft).toBe(0);
  });

  it("rejects an out-of-range correct-card side", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.matchType = MatchType.CPU;

    expect(judge.calculateGivesFromPickEvents(2)).toBe(false);
    expect(judge.givesLeft).toBe(0);
  });
});

describe("GameJudge turn flow", () => {
  it("nextTurn advances to the following character and starts the turn", () => {
    const { judge, calls } = newJudge({
      playingOrder: ["alice", "marisa", "reimu"],
      currentCharacterId: "alice",
    });

    expect(judge.nextTurn()).toBe(true);
    expect(calls.currentCharacterId).toBe("marisa");
    expect(judge.state).toBe(GameJudgeState.TurnStart);
    expect(judge.turnStartTimestamp).not.toBeNull();
    expect(judge.pickEvents).toHaveLength(0);
    expect(judge.givesLeft).toBe(0);
    expect(calls.turnStarted).toEqual(["marisa"]);
  });

  it("nextTurn wraps around the playing order", () => {
    const { judge, calls } = newJudge({
      playingOrder: ["alice", "marisa"],
      currentCharacterId: "marisa",
    });

    judge.nextTurn();
    expect(calls.currentCharacterId).toBe("alice");
  });

  it("nextTurn starts at the first character when there is no current one", () => {
    const { judge, calls } = newJudge({
      playingOrder: ["alice", "marisa"],
      currentCharacterId: "",
    });

    judge.nextTurn();
    expect(calls.currentCharacterId).toBe("alice");
  });

  it("nextTurn skips temporarily disabled characters", () => {
    const { judge, calls } = newJudge({
      playingOrder: ["alice", "marisa", "reimu"],
      characterTemporaryDisabled: new Map([["marisa", true]]),
      currentCharacterId: "alice",
    });

    judge.nextTurn();
    expect(calls.currentCharacterId).toBe("reimu");
  });

  it("nextTurn fails when every character is disabled", () => {
    const { judge, calls } = newJudge({
      playingOrder: ["alice", "marisa"],
      characterTemporaryDisabled: new Map([["alice", true], ["marisa", true]]),
      currentCharacterId: "alice",
    });

    expect(judge.nextTurn()).toBe(false);
    expect(calls.currentCharacterId).toBe("");
    expect(calls.turnStarted).toHaveLength(0);
  });

  it("confirmStart is refused for observers", () => {
    const { judge } = newJudge();
    judge.matchType = MatchType.Observer;

    expect(judge.confirmStart(0)).toEqual({ judgeChanged: false, started: false });
    expect(judge.players[0].confirmation.start).toBe(false);
  });

  it("confirmStart records the confirmation and waits for the other players", () => {
    const peer = createTestPeer();
    const { judge, calls } = newJudge({ peer });
    judge.matchType = MatchType.Server;
    judge.addPlayer("Opponent", true);
    judge.players[1].isObserver = false;

    const result = judge.confirmStart(0);

    expect(result).toEqual({ judgeChanged: true, started: false });
    expect(judge.players[0].confirmation.start).toBe(true);
    expect(judge.state).toBe(GameJudgeState.SelectingCards);
    expect(peer.recorded.eventsToClients).toEqual([
      { event: { type: "confirmStart", playerIndex: 0 }, except: null },
    ]);
    expect(calls.playingOrder).toEqual([]);
  });

  it("starts the game once every player confirmed", () => {
    const { judge, calls } = newJudge();
    judge.matchType = MatchType.None;

    // single-player practice: confirming starts immediately
    const result = judge.confirmStart(0);

    expect(result.started).toBe(true);
    // starting resets all confirmations
    expect(judge.players[0].confirmation.start).toBe(false);
    // practice counts down before the first turn; drop the pending timer
    expect(judge.state).toBe(GameJudgeState.TurnCountdownNext);
    judge.clearTimeouts();
    expect(calls.startGameOrders).toHaveLength(1);
  });

  it("confirmation helpers ignore observers", () => {
    const { judge } = newJudge();
    judge.matchType = MatchType.Server;
    judge.addPlayer();
    judge.addPlayer("Spectator", false);
    judge.players[1].isObserver = false;
    judge.players[2].isObserver = true;

    expect(judge.checkAllStartConfirmed()).toBe(false);
    expect(judge.checkAnyStartConfirmed()).toBe(false);
    judge.players[0].confirmation.start = true;
    expect(judge.checkAnyStartConfirmed()).toBe(true);
    expect(judge.checkAllStartConfirmed()).toBe(false);
    judge.players[1].confirmation.start = true;
    expect(judge.checkAllStartConfirmed()).toBe(true);
  });

  it("isGameFinished depends on mode and traditional flag", () => {
    const { judge } = newJudge();
    expect(judge.isGameFinished()).toBe(true); // empty practice deck

    judge.addToDeck(0, new CardInfo("alice", 0), null, DontSend);
    expect(judge.isGameFinished()).toBe(false);
  });
});

describe("GameJudge stopGame", () => {
  it("resets turn state and collects, but keeps decks", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.addPlayer();
    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);
    judge.state = GameJudgeState.TurnWinnerDetermined;
    judge.turnWinner = 0;
    judge.givesLeft = 3;
    judge.pickEvents = [new PickEvent(1, 0, new CardInfo("alice", 0), { deckIndex: 0, cardIndex: 0 })];
    judge.players[0].collected.push(new CardInfo("marisa", 0));
    judge.players[0].confirmation.start = true;

    judge.stopGame();

    expect(judge.state).toBe(GameJudgeState.SelectingCards);
    expect(judge.turnWinner).toBeNull();
    expect(judge.pickEvents).toHaveLength(0);
    expect(judge.givesLeft).toBe(0);
    expect(judge.players[0].collected).toHaveLength(0);
    expect(judge.players[0].confirmation).toEqual({ start: false, next: false });
    // decks survive a stop
    expect(judge.getDeck(0, 0)?.characterId).toBe("alice");
  });
});

describe("GameJudge CPU opponent", () => {
  it("ignores simulated picks outside of CPU mode", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.state = GameJudgeState.TurnStart;

    judge.simulateCPUOpponentPick(false);

    expect(judge.state).toBe(GameJudgeState.TurnStart);
    expect(judge.pickEvents).toHaveLength(0);
  });

  it("picks the correct card when not making a mistake", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.matchType = MatchType.CPU;
    judge.addCPUPlayer();
    judge.addToDeck(0, new CardInfo("alice", 0), 3, DontSend);
    judge.state = GameJudgeState.TurnStart;

    judge.simulateCPUOpponentPick(false);

    expect(judge.state).toBe(GameJudgeState.TurnWinnerDetermined);
    expect(judge.turnWinner).toBe(1);
  });

  it("picks a wrong card when making a mistake", () => {
    const { judge } = newJudge({ currentCharacterId: "alice" });
    judge.matchType = MatchType.CPU;
    judge.addCPUPlayer();
    judge.addToDeck(0, new CardInfo("marisa", 0), 1, DontSend);
    judge.state = GameJudgeState.TurnStart;

    judge.simulateCPUOpponentPick(true);

    expect(judge.state).toBe(GameJudgeState.TurnStart);
    expect(judge.pickEvents).toHaveLength(1);
    expect(judge.pickEvents[0].player).toBe(1);
  });
});

describe("GameJudge music filtering", () => {
  it("disables every character that is not in a deck", () => {
    const { judge } = newJudge({ playingOrder: ["alice", "marisa", "reimu"] });
    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);

    judge.filterMusicByDeck();

    expect(judge.characterTemporaryDisabled().get("alice")).toBe(false);
    expect(judge.characterTemporaryDisabled().get("marisa")).toBe(true);
    expect(judge.characterTemporaryDisabled().get("reimu")).toBe(true);
  });

  it("isMusicFilteredByDeck reports whether the filter is already applied", () => {
    const { judge } = newJudge({ playingOrder: ["alice", "marisa"] });
    expect(judge.isMusicFilteredByDeck(judge.characterTemporaryDisabled(), judge.playingOrder())).toBe(false);

    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);
    judge.filterMusicByDeck();

    expect(judge.isMusicFilteredByDeck(judge.characterTemporaryDisabled(), judge.playingOrder())).toBe(true);
  });

  it("judges the maps it is handed, not the ones mirrored in the outer ref", () => {
    // the ref only catches up with React state after the commit, so the render that follows a
    // click must be able to pass the values the click produced
    const { judge } = newJudge({ playingOrder: ["alice", "marisa"] });
    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);

    const pending = new Map([["alice", false], ["marisa", true]]);
    expect(judge.isMusicFilteredByDeck(pending, ["alice", "marisa"])).toBe(true);
    expect(judge.characterTemporaryDisabled().size).toBe(0);

    expect(judge.isMusicFilteredByDeck(new Map(), ["alice", "marisa"])).toBe(false);
    expect(judge.isMusicFilteredByDeck(pending, ["alice"])).toBe(true);
  });
});

describe("GameJudge client name announcement", () => {
  it("announces the name of the player at myPlayerIndex, not of player 0", () => {
    const peer = createTestPeer();
    const { judge } = newJudge({ peer });
    judge.matchType = MatchType.Client;
    judge.players[0].name = "Host";
    judge.addPlayer("Carol", true);
    judge.players[1].isObserver = false;
    judge.myPlayerIndex = 1;

    judge.remoteEventListener(0, {
      type: "syncSettings", traditionalMode: true, randomStartPosition: false,
      playbackDuration: 0, deckColumns: 8, deckRows: 3,
    });

    expect(peer.recorded.eventsToServer).toEqual([
      { type: "notifyName", name: "Carol", isObserver: false },
    ]);
  });

  it("announces the observer role when connecting as an observer", () => {
    const peer = createTestPeer();
    const { judge } = newJudge({ peer });
    judge.matchType = MatchType.Observer;
    judge.addPlayer("Watcher", true);
    judge.players[1].isObserver = false;
    judge.myPlayerIndex = 1;

    judge.remoteEventListener(0, {
      type: "syncSettings", traditionalMode: true, randomStartPosition: false,
      playbackDuration: 0, deckColumns: 8, deckRows: 3,
    });

    expect(peer.recorded.eventsToServer).toEqual([
      { type: "notifyName", name: "Watcher", isObserver: true },
    ]);
  });

  it("adding or removing a player leaves publishing to the caller", () => {
    const { judge, calls } = newJudge();

    judge.addPlayer("Watcher");
    judge.removePlayer(1);

    // A refresh in the middle of a mutation sequence would snapshot a half-updated judge.
    expect(calls.refresh).toBe(0);
  });
});

describe("GameJudge publishing contract", () => {
  // The rules engine must not publish halfway through handling something; the session layer
  // publishes once after the synchronous call, and only a deferred callback the rules own may
  // publish itself. Regression guard for the "changes cancelled out by a second instance" bug.
  afterEach(() => { vi.useRealTimers(); });

  it("remoteEventListener never publishes by itself", () => {
    const { judge, calls } = newJudge({ peer: createTestPeer() });
    judge.matchType = MatchType.Server;

    judge.remoteEventListener(1, { type: "switchTraditionalMode", traditionalMode: false });
    judge.remoteEventListener(1, { type: "filterMusicByDeck" });
    judge.remoteEventListener(1, { type: "stopGame" });

    expect(judge.traditionalMode).toBe(false);
    expect(calls.refresh).toBe(0);
  });

  it("synchronous rules publish nothing", () => {
    const { judge, calls } = newJudge();
    judge.addPlayer("Opponent", true);
    judge.players[1].isObserver = false;
    judge.givesLeft = 1;
    judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);

    judge.giveCardsRandomly(DontSend);

    expect(judge.givesLeft).toBe(0);
    expect(calls.refresh).toBe(0);
  });

  it("_serverNextTurn leaves publishing to its caller", () => {
    const { judge, calls } = newJudge();
    judge.matchType = MatchType.Server;
    judge.state = GameJudgeState.TurnStart;

    judge._serverNextTurn();
    judge.clearTimeouts();

    expect(calls.refresh).toBe(0);
  });

  it("publishes from the deferred next-turn timer it owns", () => {
    vi.useFakeTimers();
    const { judge, calls } = newJudge({ playingOrder: ["alice"] });
    judge.matchType = MatchType.Server;

    judge.setNextTurnTimeout();
    expect(calls.refresh).toBe(0);

    vi.advanceTimersByTime(3000);

    expect(calls.turnStarted).toEqual(["alice"]);
    expect(calls.refresh).toBe(1);
  });
});

describe("GameJudge match type helpers", () => {
  it("maps match types to role predicates", () => {
    const { judge } = newJudge();

    judge.matchType = MatchType.None;
    expect([judge.isServer(), judge.isClient(), judge.isObserver()]).toEqual([false, false, false]);
    expect(judge.isServerClientObserverMode()).toBe(false);

    judge.matchType = MatchType.Server;
    expect(judge.isServer()).toBe(true);
    expect(judge.isServerClientObserverMode()).toBe(true);

    judge.matchType = MatchType.Client;
    expect(judge.isClient()).toBe(true);
    expect(judge.isServerClientObserverMode()).toBe(true);

    judge.matchType = MatchType.Observer;
    expect(judge.isObserver()).toBe(true);
    expect(judge.isServerClientObserverMode()).toBe(true);
  });
});
