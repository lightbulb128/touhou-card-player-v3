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
  characterId: CharacterId;

  constructor(timestamp: number, player: Player, characterId: CharacterId) {
    this.timestamp = timestamp;
    this.player = player;
    this.characterId = characterId;
  }
};

enum OpponentType {
  None,
  CPU,
  RemotePlayer
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
  countdownCounter: number;
  playingOrder: Array<CharacterId>;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  currentCharacterId: CharacterId | null;
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
    return Object.assign(new GameJudge(), this);
  }

  constructor() {
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
    this.countdownCounter = 0;
    this.playingOrder = [];
    this.characterTemporaryDisabled = new Map<CharacterId, boolean>();
    this.currentCharacterId = null;
    this.deckRows = 3;
    this.deckColumns = 8;
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

  nextTurn(): boolean {
    const count = this.playingOrder.length;
    let startId = 0;
    if (this.currentCharacterId !== null) {
      const currentIndex = this.playingOrder.indexOf(this.currentCharacterId);
      startId = (currentIndex + 1) % count;
    }
    let found = false;
    for (let offset = startId; offset < startId + count; offset++) {
      const index = offset % count;
      const characterId = this.playingOrder[index];
      const isDisabled = this.characterTemporaryDisabled.get(characterId) || false;
      if (!isDisabled) {
        this.currentCharacterId = characterId;
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn("[GameJudge.nextTurn] No available character found in playing order.");
      this.currentCharacterId = null;
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

  confirmStart(player: Player): boolean {
    if (this.state !== GameJudgeState.SelectingCards) {
      console.warn(`[GameJudge.confirmStart] [P${player}] Invalid state: ${this.state}`);
      return false;
    }
    this.confirmations.start.ok[player] = true;
    if (this.confirmations.start.all(this.hasOpponent())) {
      this.confirmations.start = new GameConfirmation();
      this.nextTurn();
    }
    return true;
  }

  sortPickEvents(): void {
    // sort by timestamp ascending
    this.pickEvents.sort((a, b) => a.timestamp - b.timestamp);
    // check if there are events with the same characterId. if so, keep only the earliest one.
    const seenCharacterIds = new Set<CharacterId>();
    this.pickEvents = this.pickEvents.filter((event) => {
      if (seenCharacterIds.has(event.characterId)) {
        return false;
      } else {
        seenCharacterIds.add(event.characterId);
        return true;
      }
    });
  }

  calculateGivesFromPickEvents(): boolean {
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
      if (event.characterId !== this.currentCharacterId) {
        if (event.player === Alice) {
          net -= 1;
        } else {
          net += 1;
        }
      } else { 
        // for the right pick:
        // if the pick is on the picking player's side of deck, net does not change.
        // otherwise, picker give one card to the opponent
        const onAliceSide = this.deck[Alice].some(card => card.characterId === event.characterId);
        if (event.player === Alice && !onAliceSide) {
          net += 1;
        }
        if (event.player === Bob && onAliceSide) {
          net -= 1;
        }
      }
    }
    this.givesLeft = net;
    return true;
  }

  notifyPickEvent(pickEvent: PickEvent): boolean {
    this.pickEvents.push(pickEvent);
    this.sortPickEvents();
    // check if the winner is determined (someone picked the current characterId)
    let winnerFound = false;
    for (let event of this.pickEvents) {
      if (event.characterId === this.currentCharacterId) {
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
            if (cardInfo.characterId === this.currentCharacterId) {
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

  canConfirmNext(): boolean {
    if (this.state !== GameJudgeState.TurnWinnerDetermined) { return false; }
    if (this.givesLeft > 0) { return false; }
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

  setCountdown(refreshCallback: () => void): void {
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
    }
    this.countdownTimeout = setTimeout(() => {
      this.countdownCounter -= 1;
      refreshCallback();
      if (this.countdownCounter <= 0) {
        this.countdownTimeout = null;
        this.nextTurn();
      } else {
        this.setCountdown(refreshCallback);
      }
    }, 1000);
  }

  setNextTurnTimeout(refreshCallback: () => void): void {
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
    }
    this.countdownCounter = 3;
    this.state = GameJudgeState.TurnCountdownNext;
    refreshCallback();
    this.setCountdown(refreshCallback);
  }

  confirmNext(player: Player, refreshCallback: () => void): boolean {
    if (this.state !== GameJudgeState.TurnWinnerDetermined) {
      console.warn(`[GameJudge.confirmNext] [P${player}] Invalid state: ${this.state}`);
      return false;
    }
    this.confirmations.next.ok[player] = true;
    if (this.confirmations.next.all(this.hasOpponent())) {
      this.confirmations.next = new GameConfirmation();
      const needTimeout = this.opponentType == OpponentType.RemotePlayer; // only use timeout if there is a remote player
      if (needTimeout) {
        this.setNextTurnTimeout(refreshCallback);
        this.state = GameJudgeState.TurnCountdownNext;
      } else {
        this.nextTurn();
      }
    }
    return true;
  }

}

export {
  GameJudge,
  GameJudgeState,
  CardInfo,
  PickEvent,
  OpponentType,
};