import { RefObject } from "react";
import { CharacterId } from "./Configs";

const Alice = 0; // Alice is always the local host
const Bob = 1; // Bob is always the remote player
type Player = typeof Alice | typeof Bob;

enum GameJudgeState {
  SelectingCards,
  TurnStart,
  TurnWinnerDetermined,
  TurnCountdownNext,
  GameFinished,
}

class GameConfirmation {
  ok: boolean[];
  constructor() {
    this.ok = [false, false];
  }
  all(hasOpponent: boolean): boolean {
    if (hasOpponent) {
      return this.ok[0] && this.ok[1];
    } else {
      return this.ok[0];
    }
  }
}

class CardInfo {
  characterId: CharacterId | null;
  cardIndex: number;
  constructor(characterId: CharacterId | null, cardIndex: number) {
    this.characterId = characterId;
    this.cardIndex = cardIndex;
  }
  equals(other: CardInfo): boolean {
    return this.characterId === other.characterId && this.cardIndex === other.cardIndex;
  }
  toKey(): string {
    return `${this.characterId}-${this.cardIndex}`;
  }
}

class PickEvent {
  timestamp: number;
  player: Player;
  cardInfo: CardInfo;

  constructor(timestamp: number, player: Player, cardInfo: CardInfo) {
    this.timestamp = timestamp;
    this.player = player;
    this.cardInfo = cardInfo;
  }

  characterId(): CharacterId {return this.cardInfo.characterId!}
};

enum OpponentType {
  None,
  CPU,
  RemotePlayer
}

type OuterRefObject = {
  playingOrder: Array<CharacterId>;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  currentCharacterId: CharacterId;
  setCurrentCharacterId: (id: CharacterId) => void;
  notifyTurnWinnerDetermined: (winner: Player | null) => void;
  notifyTurnStarted: (characterId: CharacterId) => void;
}

class GameJudge {

  // variables
  isServer: boolean;
  opponentType: OpponentType;
  traditionalMode: boolean;
  state: GameJudgeState;
  confirmations: {
    start: GameConfirmation;
    next: GameConfirmation;
  };
  turnWinner: Player | null;
  countdownTimeout: NodeJS.Timeout | null;
  
  outerRef: RefObject<OuterRefObject>;

  deck: Array<Array<CardInfo>>;
  deckRows: number;
  deckColumns: number;
  turnStartTimestamp: number | null;
  pickEvents: Array<PickEvent>;
  collectedCards: Array<Array<CardInfo>>; // [player][]

  // number of cards to give to the opponent in this turn.
  // this should be calculated when the winner is determined in each turn.
  givesLeft: number;

  // used for setState.
  reconstruct(): GameJudge { 
    return Object.assign(new GameJudge(this.outerRef), this);
  }

  clearTimeouts(): void {
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
      this.countdownTimeout = null;
    }
  }

  stopGame(): void {
    this.clearTimeouts();
    this.state = GameJudgeState.SelectingCards;
    this.confirmations = {
      start: new GameConfirmation(),
      next: new GameConfirmation(),
    };
    this.turnWinner = null;
    this.turnStartTimestamp = null;
    this.collectedCards = [[], []];
    this.pickEvents = [];
    this.givesLeft = 0;
  }

  constructor(outerRef: RefObject<OuterRefObject>) {
    this.traditionalMode = false; 
    this.isServer = true;
    this.opponentType = OpponentType.None;
    this.state = GameJudgeState.SelectingCards;
    this.confirmations = {
      start: new GameConfirmation(),
      next: new GameConfirmation(),
    };
    this.turnWinner = null;
    this.countdownTimeout = null;
    this.outerRef = outerRef;
    this.deckRows = 1;
    this.deckColumns = 6;
    this.deck = [[], []];
    for (let i = 0; i < this.deckRows * this.deckColumns; i++) {
      this.deck[Alice].push(new CardInfo(null, 0));
      this.deck[Bob].push(new CardInfo(null, 0));
    }
    this.turnStartTimestamp = null;
    this.pickEvents = [];
    this.collectedCards = [[], []];
    this.givesLeft = 0;
  }

  adjustDeckSize(rows: number, columns: number): void {
    this.deckRows = rows;
    this.deckColumns = columns;
    const newSize = rows * columns;
    for (let player of [Alice, Bob]) {
      const currentDeck = this.deck[player];
      if (currentDeck.length > newSize) {
        this.deck[player] = currentDeck.slice(0, newSize);
      } else if (currentDeck.length < newSize) {
        for (let i = currentDeck.length; i < newSize; i++) {
          this.deck[player].push(new CardInfo(null, 0));
        }
      }
    }
  }

  removeFromDeck(player: Player, cardInfo: CardInfo): boolean {
    for (let i = 0; i < this.deck[player].length; i++) {
      if (this.deck[player][i].equals(cardInfo)) {
        this.deck[player][i] = new CardInfo(null, 0);
        return true;
      }
    }
    return false;
  }

  getDeck(player: Player, index: number): CardInfo | null {
    if (index < 0 || index >= this.deck[player].length) {
      return null;
    }
    const v = this.deck[player][index];
    if (v.characterId === null) {
      return null;
    }
    return v;
  }

  addToDeck(player: Player, cardInfo: CardInfo, toIndex: number | null): boolean {
    // if toIndex is null, add to first empty slot
    if (toIndex === null) {
      for (let i = 0; i < this.deck[player].length; i++) {
        if (this.deck[player][i].characterId === null) {
          this.deck[player][i] = cardInfo;
          return true;
        }
      }
    } else {
      this.deck[player][toIndex] = cardInfo;
      return true;
    }
    return false;
  }

  playingOrder(): Array<CharacterId> {
    return this.outerRef.current ? this.outerRef.current.playingOrder : [];
  }
  characterTemporaryDisabled(): Map<CharacterId, boolean> {
    return this.outerRef.current ? this.outerRef.current.characterTemporaryDisabled : new Map<CharacterId, boolean>();
  }
  currentCharacterId(): CharacterId | null {
    return this.outerRef.current ? this.outerRef.current.currentCharacterId : null;
  }
  g(): OuterRefObject {
    return this.outerRef.current!;
  }

  nextTurn(): boolean {
    console.log("[GameJudge.nextTurn] Moving to next turn.");
    const playingOrder = this.playingOrder();
    const characterTemporaryDisabled = this.characterTemporaryDisabled();
    const currentCharacterId = this.currentCharacterId();
    const count = playingOrder.length;
    let startId = 0;
    if (currentCharacterId !== null) {
      const currentIndex = playingOrder.indexOf(currentCharacterId);
      startId = (currentIndex + 1) % count;
    }
    let found = false;
    for (let offset = startId; offset < startId + count; offset++) {
      const index = offset % count;
      const characterId = playingOrder[index];
      const isDisabled = characterTemporaryDisabled.get(characterId) || false;
      if (!isDisabled) {
        this.g().setCurrentCharacterId(characterId);
        found = true;
        this.g().notifyTurnStarted(characterId);
        break;
      }
    }
    if (!found) {
      console.warn("[GameJudge.nextTurn] No available character found in playing order.");
      this.g().setCurrentCharacterId("");
      return false;
    }
    this.state = GameJudgeState.TurnStart;
    this.turnStartTimestamp = Date.now();
    this.pickEvents = [];
    this.turnWinner = null;
    this.givesLeft = 0;
    return true;
  }

  hasOpponent(): boolean {
    return this.opponentType !== OpponentType.None;
  }

  confirmStart(player: Player, refreshCallback: (judge: GameJudge) => void): {judgeChanged: boolean, started: boolean} {
    if (this.state !== GameJudgeState.SelectingCards) {
      console.warn(`[GameJudge.confirmStart] [P${player}] Invalid state: ${this.state}`);
      return {judgeChanged: false, started: false};
    }
    this.confirmations.start.ok[player] = true;
    if (this.confirmations.start.all(this.hasOpponent())) {
      this.confirmations.start = new GameConfirmation();
      this.countdownNextTurn(refreshCallback, true);
      return {judgeChanged: true, started: true};
    }
    return {judgeChanged: true, started: false};
  }

  sortPickEvents(): void {
    // sort by timestamp ascending
    this.pickEvents.sort((a, b) => a.timestamp - b.timestamp);
    // check if there are events with the same characterId. if so, keep only the earliest one.
    const seenCharacterIds = new Set<CharacterId>();
    this.pickEvents = this.pickEvents.filter((event) => {
      if (seenCharacterIds.has(event.characterId())) {
        return false;
      } else {
        seenCharacterIds.add(event.characterId());
        return true;
      }
    });
  }

  calculateGivesFromPickEvents(): boolean {
    const currentCharacterId = this.currentCharacterId();
    if (!this.hasOpponent) {
      this.givesLeft = 0;
      return false;
    }
    // traditional mode does not involve giving cards.
    if (this.traditionalMode) { 
      this.givesLeft = 0;
      return false;
    }
    let net = 0;
    for (let event of this.pickEvents) {
      // for each wrong pick, if Alice, net - 1, if Bob, net + 1
      if (event.characterId() !== currentCharacterId) {
        if (event.player === Alice) {
          net -= 1;
        } else {
          net += 1;
        }
      } else { 
        // for the right pick:
        // if the pick is on the picking player's side of deck, net does not change.
        // otherwise, picker give one card to the opponent
        const onAliceSide = this.deck[Alice].some(card => card.characterId === event.characterId());
        if (event.player === Alice && !onAliceSide) {
          net += 1;
        }
        if (event.player === Bob && onAliceSide) {
          net -= 1;
        }
      }
    }
    if (net > 0) {
      // check how many empty slots Bob has. if less than net, limit to that.
      let emptySlots = 0;
      for (let cardInfo of this.deck[Bob]) {
        if (cardInfo.characterId === null) {
          emptySlots += 1;
        }
      }
      net = Math.min(net, emptySlots);
    }
    if (net < 0) {
      // check how many empty slots Alice has. if less than -net, limit to that.
      let emptySlots = 0;
      for (let cardInfo of this.deck[Alice]) {
        if (cardInfo.characterId === null) {
          emptySlots += 1;
        }
      }
      net = Math.max(net, -emptySlots);
    }
    this.givesLeft = net;
    return true;
  }

  notifyPickEvent(pickEvent: PickEvent): boolean {
    const currentCharacterId = this.currentCharacterId();
    this.pickEvents.push(pickEvent);
    this.sortPickEvents();
    // check if the winner is determined (someone picked the current characterId)
    let winnerFound = false;
    for (let event of this.pickEvents) {
      if (event.characterId() === currentCharacterId) {
        this.turnWinner = event.player;
        winnerFound = true;
        break;
      }
    }
    if (winnerFound) {
      this.state = GameJudgeState.TurnWinnerDetermined;
      this.calculateGivesFromPickEvents();
      // collect card to collected
      if (this.turnWinner !== null) {
        let found = null;
        for (let deckPlayer of [Alice, Bob]) {
          for (let cardInfo of this.deck[deckPlayer]) {
            if (cardInfo.characterId === currentCharacterId) {
              this.collectedCards[this.turnWinner].push(cardInfo);
              found = cardInfo;
              break;
            }
          }
          if (found !== null) {
            break;
          }
        }
        if (found !== null) {
          // remove from deck
          this.removeFromDeck(Alice, found);
          this.removeFromDeck(Bob, found);
        }
      }
    }
    this.g().notifyTurnWinnerDetermined(this.turnWinner);
    return true;
  }

  moveCard(player: Player, from: CardInfo, toPlayer: Player, toIndex: number | null): boolean {
    const removed = this.removeFromDeck(player, from);
    if (!removed) {
      console.warn(`[GameJudge.moveCard] [P${player}] Failed to remove card from deck: ${from.characterId}, ${from.cardIndex}`);
      return false;
    }
    const added = this.addToDeck(toPlayer, from, toIndex);
    if (!added) {
      console.warn(`[GameJudge.moveCard] [P${player}] Failed to add card to deck: ${from.characterId}, ${from.cardIndex}`);
      return false;
    }
    return true;
  }

  isDeckFull(player: Player): boolean {
    for (let cardInfo of this.deck[player]) {
      if (cardInfo.characterId === null) {
        return false;
      }
    }
    return true;
  }

  isDeckEmpty(player: Player): boolean {
    for (let cardInfo of this.deck[player]) {
      if (cardInfo.characterId !== null) {
        return false;
      }
    }
    return true;
  }

  setNextTurnTimeout(refreshCallback: (judge: GameJudge) => void): void {
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
    }
    this.state = GameJudgeState.TurnCountdownNext;
    refreshCallback(this);
    // after 3 seconds, call nextTurn
    this.countdownTimeout = setTimeout(() => {
      this.nextTurn();
      refreshCallback(this);
    }, 3000);
  }

  countdownNextTurn(refreshCallback: (judge: GameJudge) => void, forceCountDown: boolean = false): void {
    const needTimeout = this.opponentType == OpponentType.RemotePlayer; // only use timeout if there is a remote player
    if (needTimeout || forceCountDown) {
      this.setNextTurnTimeout(refreshCallback);
      this.state = GameJudgeState.TurnCountdownNext;
    } else {
      this.nextTurn();
    }
  }

  canConfirmNext(): boolean {
    // cannot confirm next only if:
    // 1) there is a human opponent
    // 2) there are gives left to process
    if (this.opponentType === OpponentType.RemotePlayer && this.givesLeft !== 0) {
      return false;
    }
    return true;
  }

  finishTurn(): void {
    if (this.state === GameJudgeState.TurnWinnerDetermined) {
      if (this.opponentType === OpponentType.CPU && this.givesLeft != 0) {
        // process gives arbitrarily for CPU
        let givesLeft = this.givesLeft;
        let giver: Player = givesLeft > 0 ? Alice : Bob;
        let receiver: Player = givesLeft > 0 ? Bob : Alice;
        givesLeft = Math.abs(givesLeft);
        while (givesLeft > 0) {
          const fromIndices: number[] = [];
          this.deck[giver].forEach((cardInfo, index) => {
            if (cardInfo.characterId !== null) {
              fromIndices.push(index);
            }
          });
          const toIndices: number[] = [];
          this.deck[receiver].forEach((cardInfo, index) => {
            if (cardInfo.characterId === null) {
              toIndices.push(index);
            }
          });
          if (fromIndices.length === 0 || toIndices.length === 0) {
            break;
          }
          const fromIndex = fromIndices[Math.floor(Math.random() * fromIndices.length)];
          const toIndex = toIndices[Math.floor(Math.random() * toIndices.length)];
          const cardInfo = this.deck[giver][fromIndex];
          this.moveCard(giver, cardInfo, receiver, toIndex);
          givesLeft -= 1;
        }
      }
    }
    if (this.state === GameJudgeState.TurnStart) {
      // no winner this turn
      // check if the correct answer is in the deck. if so, remove it.
      const currentCharacterId = this.currentCharacterId();
      for (let player of [Alice, Bob]) {
        for (let i = 0; i < this.deck[player].length; i++) {
          const cardInfo = this.deck[player][i];
          if (cardInfo.characterId === currentCharacterId) {
            // remove from deck
            this.removeFromDeck(player as Player, cardInfo);
            break;
          }
        }
      }
    }
  }

  confirmNext(player: Player, refreshCallback: (judge: GameJudge) => void): {judgeChanged: boolean, nextTurn: boolean} {
    if (this.confirmations.next.ok[player]) {
      return {judgeChanged: false, nextTurn: false};
    }
    this.confirmations.next.ok[player] = true;
    if (this.confirmations.next.all(this.hasOpponent())) {
      this.confirmations.next = new GameConfirmation();
      this.finishTurn();
      this.countdownNextTurn(refreshCallback);
      return {judgeChanged: true, nextTurn: true};
    }
    return {judgeChanged: true, nextTurn: false};
  }

}

export {
  GameJudge,
  GameJudgeState,
  CardInfo,
  PickEvent,
  OpponentType,
};
export type {
  OuterRefObject,
  Player,
};