import { RefObject } from "react";
import { CharacterId, MusicSelectionMap } from "./Configs";
import Peer, { DataConnection } from "peerjs";

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
  fromDeserialized(ok: boolean[]) {
    this.ok = ok;
  }
  swap(): void {
    const temp = this.ok[0];
    this.ok[0] = this.ok[1];
    this.ok[1] = temp;
  }
  all(hasOpponent: boolean): boolean {
    if (hasOpponent) {
      return this.ok[0] && this.ok[1];
    } else {
      return this.ok[0];
    }
  }
  one(): boolean {
    return this.ok[0] || this.ok[1];
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

type DeckPosition = {deckIndex: 0 | 1, cardIndex: number}

enum OpponentType {
  None,
  CPU,
  RemotePlayer
}

type EventAddCard = {
  type: "addCard";
  cardInfo: CardInfo;
  deckPosition: DeckPosition;
};

type EventRemoveCard = {
  type: "removeCard";
  cardInfo: CardInfo;
  deckPosition: DeckPosition;
};

type EventAdjustDeckSize = {
  type: "adjustDeckSize";
  rows: number;
  columns: number;
};

type EventConfirmStart = {
  type: "confirmStart";
};

type EventConfirmNext = {
  type: "confirmNext";
};

type EventPickEvent = {
  type: "pickEvent";
  pickEvent: PickEvent;
};

type EventRequestAcknowledge = {
  type: "requestAcknowledge";
  ack: "start" | "next" | "sync";
  hash: number;
};

type SyncData = {
  deck: Array<Array<CardInfo>>;
  deckRows: number;
  deckColumns: number;
  confirmations: {
    start: GameConfirmation;
    next: GameConfirmation;
  };
  turnWinner: Player | null;
  order: Array<{ 
    characterId: CharacterId;
    musicSelection: number;
    temporaryDisabled: boolean;
  }>;
  pickEvents: Array<PickEvent>;
  collectedCards: Array<Array<CardInfo>>; // [player][]
  currentCharacterId: CharacterId;
};

const hashSyncData = (data: SyncData): number => {
  let str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

type EventAcknowledge = {
  type: "acknowledge";
  ack: "start" | "next" | "sync";
  hash: number;
  hasFullData: boolean;
  syncData?: SyncData;
};

type Event = (
  EventAddCard | EventRemoveCard | 
  EventAdjustDeckSize | EventConfirmStart | 
  EventConfirmNext | EventPickEvent |
  EventRequestAcknowledge | EventAcknowledge
);

class GamePeer {
  peer: Peer | null;
  dataConnection: DataConnection | null;
  refresh: () => void;
  notifyDisconnected: () => void;

  constructor() {
    this.peer = null;
    this.dataConnection = null;
    this.refresh = () => {};
    this.notifyDisconnected = () => {};
  }

  disconnect() {
    if (this.dataConnection) {
      this.dataConnection.close();
      this.dataConnection = null;
    }
  }

  connectToPeer(peerId: string) {
    this.ensurePeerNotNull();
    this.dataConnection = this.peer!.connect(peerId);
    this.dataConnection.on("open", () => {
      this.refresh();
    });
    this.dataConnection.on("close", () => {
      this.dataConnection = null;
      this.notifyDisconnected();
    });
  }

  hasDataConnection(): boolean {
    return this.dataConnection !== null && this.dataConnection.open;
  }

  ensurePeerNotNull() {
    if (this.peer === null) {
      this.peer = new Peer();
      this.peer.on("open", (id: string) => {
        this.refresh();
      });
      this.peer.on("connection", (conn: DataConnection) => {
        this.dataConnection = conn;
        this.refresh();
      });
      this.peer.on("disconnected", () => {
        this.dataConnection = null;
        this.notifyDisconnected();
      });
    }
  }

  getId(): string {
    this.ensurePeerNotNull();
    return this.peer!.id;
  }

  sendEvent(payload: Event) {
    if (!this.hasDataConnection()) {
      console.warn("No data connection available to send selectCards event.");
      return;
    }
    console.log("[GamePeer.sendEvent] Sending event:", payload);
    this.dataConnection!.send(JSON.stringify(payload));
  }

  resetListener(ondata: (data: any) => void) {
    if (this.dataConnection) {
      this.dataConnection.removeAllListeners("data");
      this.dataConnection.on("data", ondata);
    }
  }
  
}


type OuterRefObject = {
  playingOrder: Array<CharacterId>;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  currentCharacterId: CharacterId;
  musicSelection: Map<CharacterId, number>;
  peer: GamePeer;
  setPlayingOrder: (order: Array<CharacterId>) => void;
  setCharacterTemporaryDisabled: (map: Map<CharacterId, boolean>) => void;
  setMusicSelection: (map: MusicSelectionMap) => void;
  setCurrentCharacterId: (id: CharacterId) => void;
  notifyTurnWinnerDetermined: (winner: Player | null) => void;
  notifyTurnStarted: (characterId: CharacterId) => void;
  notifyStartGame: (order: Array<CharacterId> | null) => Array<CharacterId>; // return the new playing order
  notifyNextTurn: () => void;
  refresh: (judge: GameJudge) => void;
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

  clientWaitAcknowledge: boolean;

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

  hasRemotePlayer(): boolean {
    return this.opponentType === OpponentType.RemotePlayer;
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

  resetOpponentDeck(): void {
    this.deck[Bob] = [];
    for (let i = 0; i < this.deckRows * this.deckColumns; i++) {
      this.deck[Bob].push(new CardInfo(null, 0));
    }
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
    this.clientWaitAcknowledge = false;
  }

  adjustDeckSize(rows: number, columns: number, send: boolean): void {
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
    if (this.hasRemotePlayer() && send) {
      this.g().peer.sendEvent({
        type: "adjustDeckSize",
        rows: rows,
        columns: columns,
      });
    }
  }

  removeFromDeck(player: Player, cardInfo: CardInfo, send: boolean): boolean {
    for (let i = 0; i < this.deck[player].length; i++) {
      if (this.deck[player][i].equals(cardInfo)) {
        this.deck[player][i] = new CardInfo(null, 0);
        if (this.hasRemotePlayer() && send) {
          this.g().peer.sendEvent({
            type: "removeCard",
            cardInfo: cardInfo,
            deckPosition: {deckIndex: player, cardIndex: i},
          });
        }
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

  addToDeck(player: Player, cardInfo: CardInfo, toIndex: number | null, send: boolean): boolean {
    // if toIndex is null, add to first empty slot
    if (toIndex === null) {
      for (let i = 0; i < this.deck[player].length; i++) {
        if (this.deck[player][i].characterId === null) {
          toIndex = i;
          break;
        }
      }
    }
    if (toIndex !== null) {
      this.deck[player][toIndex] = cardInfo;
      if (this.hasRemotePlayer() && send) {
        this.g().peer.sendEvent({
          type: "addCard",
          cardInfo: cardInfo,
          deckPosition: {deckIndex: player, cardIndex: toIndex},
        });
      }
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

  isGeneralServer(): boolean {
    return this.isServer || this.opponentType !== OpponentType.RemotePlayer;
  }

  _serverStartGame(order: Array<CharacterId> | null): Array<CharacterId> {
    this.countdownNextTurn(true);
    return this.g().notifyStartGame(order);
  }

  _clientStartGame(): void {
    this.confirmations.start = new GameConfirmation();
    if (this.isGeneralServer()) { 
      // server generates the new order, so it gives a null
      const newPlayingOrder = this._serverStartGame(null); 
      // if this is server, actively send an ack with full data
      if (this.hasRemotePlayer() && this.isServer) {
        this.sendAcknowledgeRequest(
          "start", true, 0, 
          newPlayingOrder,
          (newPlayingOrder.length > 0) ? newPlayingOrder[newPlayingOrder.length - 1] : ""
        );
      }
      return; 
    }
    this.clientWaitAcknowledge = true;
  }

  confirmStart(player: Player): {judgeChanged: boolean, started: boolean} {
    if (this.state !== GameJudgeState.SelectingCards) {
      console.warn(`[GameJudge.confirmStart] [P${player}] Invalid state: ${this.state}`);
      return {judgeChanged: false, started: false};
    }
    this.confirmations.start.ok[player] = true;
    if (this.hasRemotePlayer()) {
      this.g().peer.sendEvent({
        type: "confirmStart",
      });
    }
    if (this.confirmations.start.all(this.hasOpponent())) {
      this._clientStartGame();
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

  notifyPickEvent(pickEvent: PickEvent, send: boolean): boolean {
    const currentCharacterId = this.currentCharacterId();
    this.pickEvents.push(pickEvent);
    if (this.hasRemotePlayer() && send) {
      this.g().peer.sendEvent({
        type: "pickEvent",
        pickEvent: pickEvent,
      });
    }
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
          this.removeFromDeck(Alice, found, send);
          this.removeFromDeck(Bob, found, send);
        }
      }
    }
    this.g().notifyTurnWinnerDetermined(this.turnWinner);
    return true;
  }

  moveCard(player: Player, from: CardInfo, toPlayer: Player, toIndex: number | null, send: boolean): boolean {
    const removed = this.removeFromDeck(player, from, send);
    if (!removed) {
      console.warn(`[GameJudge.moveCard] [P${player}] Failed to remove card from deck: ${from.characterId}, ${from.cardIndex}`);
      return false;
    }
    const added = this.addToDeck(toPlayer, from, toIndex, send);
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

  setNextTurnTimeout(): void {
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
    }
    this.state = GameJudgeState.TurnCountdownNext;
    this.g().refresh(this);
    // after 3 seconds, call nextTurn
    this.countdownTimeout = setTimeout(() => {
      this.nextTurn();
      this.g().refresh(this);
    }, 3000);
  }

  countdownNextTurn(forceCountDown: boolean = false): void {
    const needTimeout = this.opponentType == OpponentType.RemotePlayer; // only use timeout if there is a remote player
    if (needTimeout || forceCountDown) {
      this.setNextTurnTimeout();
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

  _serverNextTurn(): void {
    this.finishTurn();
    this.countdownNextTurn();
    this.g().notifyNextTurn();
    this.g().refresh(this);
  }

  _clientNextTurn(): void {
    this.confirmations.next = new GameConfirmation();
    if (this.isGeneralServer()) { this._serverNextTurn(); return; }
    this.clientWaitAcknowledge = true;
    // send a requestAcknowledge event with type next
    this.g().peer.sendEvent({
      type: "requestAcknowledge",
      ack: "next",
      hash: hashSyncData(this.buildSyncData()),
    });
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
          this.moveCard(giver, cardInfo, receiver, toIndex, false);
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
            this.removeFromDeck(player as Player, cardInfo, false);
            break;
          }
        }
      }
    }
  }

  confirmNext(player: Player): {judgeChanged: boolean, nextTurn: boolean} {
    if (this.confirmations.next.ok[player]) {
      return {judgeChanged: false, nextTurn: false};
    }
    this.confirmations.next.ok[player] = true;
    if (this.confirmations.next.all(this.hasOpponent())) {
      this._clientNextTurn();
      return {judgeChanged: true, nextTurn: true};
    }
    return {judgeChanged: true, nextTurn: false};
  }

  buildSyncData(
    overwritePlayingOrder: Array<CharacterId> | null = null,
    overwriteCurrentCharacterId: CharacterId | null = null
  ): SyncData {
    const baseData: SyncData = {
      deck: this.deck,
      deckRows: this.deckRows,
      deckColumns: this.deckColumns,
      confirmations: this.confirmations,
      turnWinner: this.turnWinner,
      order: new Array<{ 
        characterId: CharacterId;
        musicSelection: number;
        temporaryDisabled: boolean;
      }>(),
      pickEvents: this.pickEvents,
      currentCharacterId: this.currentCharacterId()!,
      collectedCards: this.collectedCards,
    };
    let playingOrder = this.playingOrder();
    if (overwritePlayingOrder !== null) {
      playingOrder = overwritePlayingOrder;
    }
    baseData.order = playingOrder.map(characterId => ({
      characterId: characterId,
      musicSelection: this.g().musicSelection.get(characterId) || 0,
      temporaryDisabled: this.characterTemporaryDisabled().get(characterId) || false,
    }));
    if (overwriteCurrentCharacterId !== null) {
      baseData.currentCharacterId = overwriteCurrentCharacterId;
    }
    return baseData;
  } 

  sendAcknowledgeRequest(
    ack: "start" | "next" | "sync", 
    hasFullData: boolean,
    checkHash: number = 0,
    overwritePlayingOrder: Array<CharacterId> | null = null,
    overwriteCurrentCharacterId: CharacterId | null = null,
  ): void {

    let syncData = ((hasFullData || checkHash !== 0) 
      ? this.buildSyncData(overwritePlayingOrder, overwriteCurrentCharacterId) 
      : undefined
    );
    const hash = syncData ? hashSyncData(syncData) : 0;
    hasFullData = hasFullData || (checkHash !== 0 && hash !== checkHash);
    this.g().peer.sendEvent({
      type: "acknowledge",
      ack: ack,
      hash: hash,
      hasFullData: hasFullData,
      syncData: hasFullData ? syncData : undefined,
    });
  }

  // this function is used to be passed to the GamePeer object.
  remoteEventListener(data: any): void {

    // Reverse Role
    const cRole = (i: Player) => i === Alice ? Bob : Alice;

    const event = JSON.parse(data) as Event;
    console.log("[GameJudge.remoteEventListener] Received event:", event);
    switch (event.type) {
      case "addCard": {
        const e = event as EventAddCard;
        e.cardInfo = new CardInfo(e.cardInfo.characterId, e.cardInfo.cardIndex);
        const result = this.addToDeck(cRole(e.deckPosition.deckIndex), e.cardInfo, e.deckPosition.cardIndex, false);
        if (result) { this.g().refresh(this); }
        break;
      }
      case "removeCard": {
        const e = event as EventRemoveCard;
        e.cardInfo = new CardInfo(e.cardInfo.characterId, e.cardInfo.cardIndex);
        const result = this.removeFromDeck(cRole(e.deckPosition.deckIndex), e.cardInfo, false);
        if (result) { this.g().refresh(this); }
        break;
      }
      case "adjustDeckSize": {
        const e = event as EventAdjustDeckSize;
        this.adjustDeckSize(e.rows, e.columns, false);
        this.g().refresh(this);
        break;
      }
      case "confirmStart": {
        this.confirmations.start.ok[Bob] = true;
        if (this.confirmations.start.all(this.hasOpponent())) {
          this._clientStartGame();
        }
        break;
      }
      case "confirmNext": {
        this.confirmations.next.ok[Bob] = true;
        if (this.confirmations.next.all(this.hasOpponent())) {
          this.confirmations.next = new GameConfirmation();
          this.finishTurn();
          this.countdownNextTurn();
          this.g().refresh(this);
        }
        break;
      }
      case "pickEvent": {
        const e = event as EventPickEvent;
        e.pickEvent.cardInfo = new CardInfo(e.pickEvent.cardInfo.characterId, e.pickEvent.cardInfo.cardIndex);
        this.notifyPickEvent(new PickEvent(
          e.pickEvent.timestamp,
          cRole(e.pickEvent.player),
          e.pickEvent.cardInfo,
        ), false);
        this.g().refresh(this);
        break;
      }
      case "requestAcknowledge": {
        const e = event as EventRequestAcknowledge;
        if (e.ack === "start") {
          this.sendAcknowledgeRequest("start", true);
        } else {
          // for "next" and "sync", check hash
          this.sendAcknowledgeRequest(e.ack, false, e.hash);
        }
        break;
      }
      case "acknowledge": {
        const e = event as EventAcknowledge;
        // first update full data if available
        if (e.hasFullData && e.syncData) {
          const sd = e.syncData;

          // swap deck sides
          this.deck = [[], []];
          this.deck[Alice] = sd.deck[Bob].map(ci => new CardInfo(ci.characterId, ci.cardIndex));
          this.deck[Bob] = sd.deck[Alice].map(ci => new CardInfo(ci.characterId, ci.cardIndex));

          this.deckRows = sd.deckRows;
          this.deckColumns = sd.deckColumns;

          // swap confirmations
          {
            const start = new GameConfirmation();
            start.fromDeserialized(sd.confirmations.start.ok);
            start.swap();
            this.confirmations.start = start;
            const next = new GameConfirmation();
            next.fromDeserialized(sd.confirmations.next.ok);
            next.swap();
            this.confirmations = {
              start: start,
              next: next,
            };
          }

          this.turnWinner = sd.turnWinner !== null ? cRole(sd.turnWinner) : null;

          // change pickevent players
          this.pickEvents = sd.pickEvents.map(
            pe => new PickEvent(
              pe.timestamp, 
              cRole(pe.player), 
              new CardInfo(pe.cardInfo.characterId, pe.cardInfo.cardIndex)
            )
          );

          const order = sd.order;
          const tempDisabledMap = new Map<CharacterId, boolean>();
          const musicSelectionMap = new Map<CharacterId, number>();
          for (let o of order) {
            tempDisabledMap.set(o.characterId, o.temporaryDisabled);
            musicSelectionMap.set(o.characterId, o.musicSelection);
          }
          this.g().setCharacterTemporaryDisabled(tempDisabledMap);
          this.g().setMusicSelection(musicSelectionMap);
          // compare current playing order, if different, update
          {
            const currentOrder = this.playingOrder();
            const newOrder = order.map(o => o.characterId);
            let different = currentOrder.length !== newOrder.length;
            if (!different) {
              for (let i = 0; i < currentOrder.length; i++) {
                if (currentOrder[i] !== newOrder[i]) {
                  different = true;
                  break;
                }
              }
            }
            if (different) {
              this.g().setPlayingOrder(order.map(o => o.characterId));
            }
          }
          // compare currentCharacterId, if different, update
          {
            if (this.currentCharacterId() !== sd.currentCharacterId) {
              this.g().setCurrentCharacterId(sd.currentCharacterId);
            }
          }
          this.g().refresh(this);
        }
        if (e.ack === "start") {
          this.clientWaitAcknowledge = false;
          // client receives the new order from the server.
          const receivedOrder = e.syncData ? e.syncData.order.map(o => o.characterId) : [];
          this._serverStartGame(receivedOrder);
        } else if (e.ack === "next") {
          this.clientWaitAcknowledge = false;
          this._serverNextTurn();
        }
      }
    }
  }

}

export {
  GameJudge,
  GameJudgeState,
  CardInfo,
  PickEvent,
  OpponentType,
  GamePeer,
};
export type {
  OuterRefObject,
  Player,
  DeckPosition,
};