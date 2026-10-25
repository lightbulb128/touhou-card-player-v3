import { describe, expect, it } from "vitest";
import { GameJudge } from "../../types/GameJudge";
import { CardInfo, GameJudgeState, MatchType, PickEvent, SendOption } from "../../types/GameTypes";
import { CharacterId, GlobalData, MusicSelectionMap } from "../../types/Configs";
import { BoardLayout, BoardLayoutInput, computeBoardLayout, toDeckCardPosition } from "../../lib/geometry";
import { CardBackgroundState } from "../../lib/cardState";
import { createTestGlobalData, createTestOuterRef } from "../../test/fixtures";
import { buildCardVisuals, CardVisuals } from "./cardVisuals";
import type { DragInfo } from "./cardDrag";

const DontSend: SendOption = { send: false, except: null };

function makeLayout(judge: GameJudge, overrides: Partial<BoardLayoutInput> = {}): BoardLayout {
  return computeBoardLayout({
    containerWidth: 1600,
    cardWidthPercentage: 0.08,
    deckRows: judge.deckRows,
    deckColumns: judge.deckColumns,
    isMelee: judge.isMelee(),
    isCPU: judge.matchType === MatchType.CPU,
    isServer: judge.isServer(),
    isServerClientObserver: judge.isServerClientObserverMode(),
    isNoOpponent: judge.matchType === MatchType.None,
    isSelectingCards: judge.state === GameJudgeState.SelectingCards,
    isObserver: judge.isObserver(),
    players: judge.players,
    ...overrides,
  });
}

function makeHarness(options: {
  data?: GlobalData;
  setUp?: (judge: GameJudge) => void;
  overrides?: Partial<BoardLayoutInput>;
  musicSelection?: MusicSelectionMap;
  currentCharacterId?: CharacterId;
  unusedCards?: Array<CardInfo>;
  hoveringCardInfo?: CardInfo | null;
  dragInfo?: DragInfo | null;
  cardSelectionSliderValue?: number;
} = {}) {
  const data = options.data ?? createTestGlobalData();
  const outerRef = createTestOuterRef({ globalData: data });
  const judge = new GameJudge(outerRef);
  options.setUp?.(judge);
  const layout = makeLayout(judge, options.overrides);

  const hovered: Array<CardInfo | null> = [];
  const clicked: Array<{ playerIndex: 0 | 1; cardIndex: number; cardInfo: CardInfo }> = [];
  const visuals: CardVisuals = buildCardVisuals({
    globalData: data,
    judge,
    layout,
    musicSelection: options.musicSelection ?? new Map(),
    currentCharacterId: options.currentCharacterId ?? "",
    cardSelectionSliderValue: options.cardSelectionSliderValue ?? 0,
    dragInfo: options.dragInfo ?? null,
    hoveringCardInfo: options.hoveringCardInfo ?? null,
    unusedCards: options.unusedCards ?? [],
    onCardHover: (cardInfo) => { hovered.push(cardInfo); },
    onDeckCardClick: (playerIndex, cardIndex, cardInfo) => {
      clicked.push({ playerIndex, cardIndex, cardInfo });
    },
  });

  return { data, judge, layout, visuals, hovered, clicked };
}

function dragOf(cardInfo: CardInfo, overrides: Partial<DragInfo> = {}): DragInfo {
  return {
    dragging: true,
    mouseDownTimestamp: 0,
    initialMouseX: 0,
    initialMouseY: 0,
    relativeToCardX: 0,
    relativeToCardY: 0,
    currentMouseX: 0,
    currentMouseY: 0,
    cardInfo,
    dragType: "fromSelectable",
    dragFromDeck: null,
    ...overrides,
  };
}

describe("buildCardVisuals placeholders and deck cards", () => {
  it("keeps every card hidden and every slot empty on a fresh board", () => {
    const { visuals, judge } = makeHarness();

    // practice mode has no far deck, so only the near slots exist
    expect(visuals.placeholders).toHaveLength(judge.deckRows * judge.deckColumns);
    expect(visuals.placeholders.every((slot) => slot.hidden === false)).toBe(true);
  });

  it("keeps a card that nobody can pick hidden", () => {
    const { visuals } = makeHarness({ musicSelection: new Map([["alice", -1]]) });

    // alice is disabled, so it is neither in the deck nor in the selectable row
    expect(visuals.cards.get("alice-0")?.visible).toBe(false);
    expect(visuals.cards.get("marisa-0")?.visible).toBe(true);
  });

  it("shows a card where the deck keeps it and hides its placeholder", () => {
    const { visuals, layout } = makeHarness({
      setUp: (judge) => { judge.addToDeck(0, new CardInfo("alice", 0), 3, DontSend); },
    });

    const card = visuals.cards.get("alice-0");
    const expected = toDeckCardPosition(layout, 0, 3);
    expect(card?.visible).toBe(true);
    expect(card?.x).toBe(expected.x);
    expect(card?.y).toBe(expected.y);
    expect(visuals.placeholders[3].hidden).toBe(true);
  });

  it("marks the far deck as upside down in a CPU match", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => {
        judge.matchType = MatchType.CPU;
        judge.addCPUPlayer();
        judge.addToDeck(1, new CardInfo("marisa", 0), 0, DontSend);
      },
    });

    expect(visuals.cards.get("marisa-0")?.visible).toBe(true);
    expect(visuals.cards.get("marisa-0")?.upsideDown).toBe(true);
  });

  it("offers the pick handler only while a turn is running", () => {
    const { visuals, clicked } = makeHarness({
      setUp: (judge) => {
        judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);
        judge.state = GameJudgeState.TurnStart;
      },
    });

    visuals.cards.get("alice-0")?.onClick?.();

    expect(clicked).toHaveLength(1);
    expect(clicked[0].playerIndex).toBe(0);
    expect(clicked[0].cardIndex).toBe(0);
    expect(clicked[0].cardInfo.toKey()).toBe("alice-0");
  });

  it("reports pick feedback as correct or incorrect", () => {
    const { visuals } = makeHarness({
      currentCharacterId: "alice",
      setUp: (judge) => {
        judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend);
        judge.addToDeck(0, new CardInfo("marisa", 0), 1, DontSend);
        judge.pickEvents.push(
          new PickEvent(0, 0, new CardInfo("alice", 0), { deckIndex: 0, cardIndex: 0 }),
          new PickEvent(0, 0, new CardInfo("marisa", 0), { deckIndex: 0, cardIndex: 1 }),
        );
      },
    });

    expect(visuals.cards.get("alice-0")?.backgroundState).toBe(CardBackgroundState.Correct);
    expect(visuals.cards.get("marisa-0")?.backgroundState).toBe(CardBackgroundState.Incorrect);
  });
});

describe("buildCardVisuals selectable row", () => {
  it("lists every card whose character is not in a deck, left to right", () => {
    const { visuals } = makeHarness();

    expect(visuals.selectableCards.map((entry) => entry.cardInfo.toKey())).toEqual([
      "alice-0", "alice-1", "marisa-0", "reimu-0", "youmu-0",
    ]);
    expect(visuals.selectableCards[1].x).toBeGreaterThan(visuals.selectableCards[0].x);
    expect(visuals.cards.get("alice-0")?.visible).toBe(true);
  });

  it("skips characters already in a deck, disabled characters and the dragged one", () => {
    const { visuals } = makeHarness({
      musicSelection: new Map([["reimu", -1]]),
      dragInfo: dragOf(new CardInfo("youmu", 0)),
      setUp: (judge) => { judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend); },
    });

    const keys = visuals.selectableCards.map((entry) => entry.cardInfo.toKey());
    // a character with a card in the deck is out of the row entirely, siblings included
    expect(keys).not.toContain("alice-0");
    expect(keys).not.toContain("alice-1");
    expect(keys).not.toContain("reimu-0");
    expect(keys).not.toContain("youmu-0");
    expect(keys).toEqual(["marisa-0"]);
  });

  it("scrolls the row with the slider when it overflows the deck width", () => {
    const data = createTestGlobalData({
      alice: { card: Array.from({ length: 40 }, (_unused, index) => `alice-${index}`) },
    });
    const centered = makeHarness({ data, cardSelectionSliderValue: 0 });
    const scrolled = makeHarness({ data, cardSelectionSliderValue: 1 });

    expect(centered.visuals.selectableCards[0].x).toBeGreaterThan(
      scrolled.visuals.selectableCards[0].x,
    );
  });

  it("follows the pointer with the dragged card", () => {
    const { visuals } = makeHarness({
      dragInfo: dragOf(new CardInfo("alice", 0), { currentMouseX: 400, currentMouseY: 120 }),
    });

    const card = visuals.cards.get("alice-0");
    expect(card?.visible).toBe(true);
    expect(card?.x).toBe(400);
    expect(card?.y).toBe(120);
    expect(card?.backgroundState).toBe(CardBackgroundState.Hover);
    expect(card?.transition).toContain("0.1s");
  });
});

describe("buildCardVisuals unused pile", () => {
  it("places the pile along the strip once the lineup is being played", () => {
    const unused = [new CardInfo("reimu", 0), new CardInfo("youmu", 0)];
    const { visuals, layout } = makeHarness({
      unusedCards: unused,
      setUp: (judge) => { judge.state = GameJudgeState.TurnStart; },
    });

    expect(visuals.cards.get("reimu-0")?.visible).toBe(true);
    expect(visuals.cards.get("reimu-0")?.x).toBe(layout.canvasMargin);
    expect(visuals.cards.get("youmu-0")?.x).toBe(
      layout.canvasMargin + visuals.unusedStrip.step,
    );
  });

  it("lets the selectable row place a card that is both unused and selectable", () => {
    // while building a lineup the row wins: the card is reachable there
    const { visuals } = makeHarness({ unusedCards: [new CardInfo("reimu", 0)] });
    const row = visuals.selectableCards.find((entry) => entry.cardInfo.toKey() === "reimu-0");

    expect(visuals.cards.get("reimu-0")?.x).toBe(row?.x);
  });

  it("reports a canvas that always fits the pile band", () => {
    const { visuals, layout } = makeHarness();

    expect(visuals.canvasHeight).toBeGreaterThanOrEqual(layout.baseCanvasHeight);
    expect(visuals.canvasHeight).toBeGreaterThanOrEqual(visuals.unusedStrip.requiredCanvasHeight);
  });
});

describe("buildCardVisuals collected piles", () => {
  it("collects one score badge per side", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => {
        judge.matchType = MatchType.CPU;
        judge.addCPUPlayer();
        judge.state = GameJudgeState.TurnStart;
      },
    });

    expect(visuals.collectedModel.scoreBadges.map((badge) => badge.score)).toEqual([0, 0]);
    expect(visuals.collectedModel.observerList).toBeNull();
  });

  it("lists connected observers", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => {
        judge.matchType = MatchType.Server;
        judge.addPlayer("Watcher");
      },
    });

    expect(visuals.collectedModel.observerList?.entries).toEqual([
      { name: "Watcher", isSelf: false },
    ]);
  });

  it("marks the local observer when the local player is the watcher", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => {
        judge.matchType = MatchType.Observer;
        judge.addPlayer("Host");
        judge.myPlayerIndex = 1;
      },
    });

    expect(visuals.collectedModel.observerList?.entries).toEqual([
      { name: "Host", isSelf: true },
    ]);
  });
});

describe("buildCardVisuals hover and cheat hints", () => {
  it("raises a hovered card that is not in a deck", () => {
    const hovering = new CardInfo("alice", 0);
    const { visuals } = makeHarness({ hoveringCardInfo: hovering });
    const sitting = makeHarness();

    expect(visuals.cards.get("alice-0")?.backgroundState).toBe(CardBackgroundState.Hover);
    expect(visuals.cards.get("alice-0")!.y).toBe(sitting.visuals.cards.get("alice-0")!.y - 16);
  });

  it("just highlights a hovered card that is in a deck", () => {
    const { visuals } = makeHarness({
      hoveringCardInfo: new CardInfo("alice", 0),
      setUp: (judge) => { judge.addToDeck(0, new CardInfo("alice", 0), 0, DontSend); },
    });

    expect(visuals.cards.get("alice-0")?.backgroundState).toBe(CardBackgroundState.Hover);
  });

  it("reports hover callbacks to the caller", () => {
    const { visuals, hovered } = makeHarness();
    const card = visuals.cards.get("alice-0");

    card?.onMouseEnter?.();
    card?.onMouseLeave?.();

    expect(hovered.map((entry) => entry?.toKey() ?? null)).toEqual(["alice-0", null]);
  });

  it("points the cheat hint at the answer card in a deck", () => {
    const { visuals } = makeHarness({
      currentCharacterId: "marisa",
      setUp: (judge) => { judge.addToDeck(0, new CardInfo("marisa", 0), 5, DontSend); },
    });

    expect(visuals.cheatCardKey).toBe("marisa-0");
  });

  it("has no cheat hint while the answer is not in a deck", () => {
    const { visuals } = makeHarness({ currentCharacterId: "youmu" });

    expect(visuals.cheatCardKey).toBeNull();
  });
});

describe("buildCardVisuals melee name labels", () => {
  /** Server, two remote players and a spectator: the smallest melee, with one card collected each. */
  function setUpMelee(judge: GameJudge, matchType: MatchType, myPlayerIndex: number) {
    judge.matchType = matchType;
    judge.players[0].name = "Server";
    judge.addPlayer("P2");
    judge.players[1].isObserver = false;
    judge.addPlayer("P3");
    judge.players[2].isObserver = false;
    judge.addPlayer("Watcher");
    judge.myPlayerIndex = myPlayerIndex;
    judge.state = GameJudgeState.TurnStart;
    judge.players.forEach((player, index) => {
      if (!player.isObserver) { player.collected.push(new CardInfo("alice", index)); }
    });
  }

  it("labels every player's pile for a melee observer", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => { setUpMelee(judge, MatchType.Observer, 3); },
    });

    // no plate is shown to a spectator, so each pile carries its own player's name
    expect(visuals.collectedModel.scoreLabels.map((label) => label.prefix))
      .toEqual(["Player Server", "Player P2", "Player P3"]);
    // the names already carry the score, so the separate score badges stay hidden
    expect(visuals.collectedModel.scoreBadges).toEqual([]);
    expect(visuals.collectedModel.observerList?.entries).toEqual([
      { name: "Watcher", isSelf: true },
    ]);
  });

  it("keeps the local spectator out of the player labels", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => { setUpMelee(judge, MatchType.Observer, 3); },
    });

    const prefixes = visuals.collectedModel.scoreLabels.map((label) => label.prefix);
    expect(prefixes.some((prefix) => prefix.includes("Watcher"))).toBe(false);
  });

  it("labels the other players, never the local client, in a melee lineup", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => { setUpMelee(judge, MatchType.Client, 2); },
    });

    // P3 sits at the local slot, so it is named by the near plate instead of a pile label
    expect(visuals.collectedModel.scoreLabels.map((label) => label.prefix))
      .toEqual(["Opponent Server", "Opponent P2"]);
  });

  it("shows no pile labels while the melee lineup is being built", () => {
    const { visuals } = makeHarness({
      setUp: (judge) => {
        setUpMelee(judge, MatchType.Observer, 3);
        judge.state = GameJudgeState.SelectingCards;
        judge.players.forEach((player) => { player.collected = []; });
      },
    });

    expect(visuals.collectedModel.scoreLabels).toEqual([]);
    expect(visuals.collectedModel.scoreBadges).toEqual([]);
    // the observer list keeps its own name visible during the lineup
    expect(visuals.collectedModel.observerList?.entries).toEqual([
      { name: "Watcher", isSelf: true },
    ]);
  });
});
