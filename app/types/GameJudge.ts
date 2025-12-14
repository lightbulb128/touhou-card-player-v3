import { RefObject } from "react";
import { CharacterId, GlobalData, MusicSelectionMap, PlaybackSetting } from "./Configs";
import Peer, { DataConnection, PeerOptions } from "peerjs";

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

type SyncData = {
  deck: Array<Array<CardInfo>>;
  deckRows: number;
  deckColumns: number;
  turnWinner: Player | null;
  order: Array<{ 
    characterId: CharacterId;
    musicSelection: number;
    temporaryDisabled: boolean;
  }>;
  pickEvents: Array<PickEvent>;
  collectedCards: Array<Array<CardInfo>>; // [player][]
  currentCharacterId: CharacterId | null;
};

type EventPickEvent = {
  type: "pickEvent";
  pickEvent: PickEvent;
};

type EventSyncWinnerDetermined = {
  type: "syncWinnerDetermined";
  data: SyncData;
};

type EventSyncStart = {
  type: "syncStart";
  data: SyncData;
  traditionalMode: boolean;
  randomStartPosition: boolean;
  playbackDuration: number;
  rngSeed: number;
}

type EventChat = {
  type: "chat";
  message: string;
}

type EventRequestSyncData = {
  type: "requestSyncData";
};

type EventSyncData = {  
  type: "syncData";
  data: SyncData;
};

type EventSyncNextTurn = {
  type: "syncNextTurn";
  data: SyncData;
  rngSeed: number;
};

type EventStopGame = {
  type: "stopGame";
};

type EventGive = {
  type: "give";
};

type EventSwitchTraditionalMode = {
  type: "switchTraditionalMode";
  traditionalMode: boolean;
};

type EventPauseMusic = {
  type: "pauseMusic";
};

type EventResumeMusic = {
  type: "resumeMusic";
};

type EventFilterMusicByDeck = {
  type: "filterMusicByDeck";
};

type EventSyncSettings = {
  type: "syncSettings";
  traditionalMode: boolean;
  randomStartPosition: boolean;
  playbackDuration: number;
  deckColumns: number;
  deckRows: number;
}

type EventNotifyName = {
  type: "notifyName";
  name: string;
}

// reverse the sync data (swap players)
const reverseSyncData = (data: SyncData): SyncData => {
  const reconstructCardInfo = (d: CardInfo): CardInfo => {
    return new CardInfo(d.characterId, d.cardIndex);
  };
  const reconstructCardArray = (d: Array<CardInfo>): Array<CardInfo> => {
    const newArray: Array<CardInfo> = [];
    for (const cardInfo of d) {
      newArray.push(reconstructCardInfo(cardInfo));
    }
    return newArray;
  };
  const newDeck = [reconstructCardArray(data.deck[Bob]), reconstructCardArray(data.deck[Alice])];
  const newPickEvents = data.pickEvents.map((event) => {
    const newPlayer = event.player === Alice ? Bob : Alice;
    return new PickEvent(event.timestamp, newPlayer, reconstructCardInfo(event.cardInfo));
  });
  const newCollectedCards = [reconstructCardArray(data.collectedCards[Bob]), reconstructCardArray(data.collectedCards[Alice])];
  return {
    deck: newDeck,
    deckRows: data.deckRows,
    deckColumns: data.deckColumns,
    turnWinner: data.turnWinner === null ? null : (data.turnWinner === Alice ? Bob : Alice),
    order: data.order,
    pickEvents: newPickEvents,
    collectedCards: newCollectedCards,
    currentCharacterId: data.currentCharacterId,
  };
};

type Event = (
  EventAddCard | EventRemoveCard | 
  EventAdjustDeckSize | EventConfirmStart | 
  EventConfirmNext | EventPickEvent |
  EventSyncWinnerDetermined | EventSyncStart | EventSyncNextTurn |
  EventStopGame | EventSwitchTraditionalMode | EventPauseMusic | EventResumeMusic |
  EventGive | EventSyncSettings | EventFilterMusicByDeck |
  EventNotifyName | EventRequestSyncData | EventSyncData |
  EventChat
); 

class GamePeer {
  peer: Peer | null;
  dataConnection: DataConnection | null;
  refresh: () => void;
  notifyDisconnected: () => void;
  notifyConnected: (peer: GamePeer) => void;
  notifyPeerError: (message: string) => void;

  constructor() {
    this.peer = null;
    this.dataConnection = null;
    this.refresh = () => {};
    this.notifyDisconnected = () => {};
    this.notifyConnected = () => {};
    this.notifyPeerError = () => {};
  }

  disconnect() {
    if (this.dataConnection) {
      this.dataConnection.close();
      this.dataConnection = null;
    }
  }

  connectToPeer(peerId: string) {
    this.ensurePeerNotNull();
    const dataConnection = this.peer!.connect(peerId);
    dataConnection.on("error", (err) => {
      console.error("[GamePeer] DataConnection error:", err);
      this.notifyPeerError(`DataConnection error: ${err}`);
    });
    dataConnection.on("open", () => {
      if (!this.dataConnection) {
        this.dataConnection = dataConnection;
        this.notifyConnected(this);
        this.refresh();
      }
    });
    dataConnection.on("close", () => {
      dataConnection?.removeAllListeners("data");
      this.dataConnection = null;
      this.notifyDisconnected();
    });
  }

  hasDataConnection(): boolean {
    return this.dataConnection !== null;
  }

  ensurePeerNotNull(forceReconstructPeer: boolean = false) {
    if (this.peer === null || forceReconstructPeer) {
      this.peer = new Peer({ 
        'iceServers': [
          { 'urls': 'stun:stun.servcices.mozilla.com' }
        ], 
        'sdpSemantics': 'unified-plan' 
      } as PeerOptions);
      this.peer.on("error", (err) => {
        console.error("[GamePeer] Peer error:", err);
        this.notifyPeerError(`Peer error: ${err}`);
      });
      this.peer.on("open", (_: string) => {
        this.refresh();
      });
      this.peer.on("connection", (conn: DataConnection) => {
        if (!this.dataConnection) {
          this.dataConnection = conn;
          this.dataConnection.on("open", () => {
            this.notifyConnected(this);
            this.refresh();
          });
          this.dataConnection.on("close", () => {
            this.dataConnection?.removeAllListeners("data");
            this.notifyDisconnected();
            this.dataConnection = null;
          });
          console.log("[GamePeer] Incoming connection from peer:", conn.peer);
          this.refresh();
        } else {
          console.log("[GamePeer] Rejecting incoming connection from peer (already connected):", conn.peer);
          conn.close();
        }
      });
      this.peer.on("disconnected", () => {
        this.dataConnection?.removeAllListeners("data");
        this.dataConnection = null;
        // remove peer so that a new one can be created
        this.peer = null;
      });
    }
  }

  getId(): string {
    this.ensurePeerNotNull();
    return this.peer!.id;
  }

  sendEvent(payload: Event) {
    if (!this.hasDataConnection()) {
      console.warn("No data connection available to send event:", payload);
      return;
    }
    console.log("[GamePeer] Sending event:", payload);
    this.dataConnection!.send(JSON.stringify(payload));
  }

  resetListener(ondata: (data: unknown) => void) {
    if (this.dataConnection) {
      this.dataConnection.removeAllListeners("data");
      this.dataConnection.on("data", ondata);
    }
  }
  
}


type OuterRefObject = {
  globalData: GlobalData;
  playingOrder: Array<CharacterId>;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  currentCharacterId: CharacterId;
  musicSelection: Map<CharacterId, number>;
  playbackSetting: PlaybackSetting,
  peer: GamePeer;
  setPlayingOrder: (order: Array<CharacterId>) => void;
  setCharacterTemporaryDisabled: (map: Map<CharacterId, boolean>) => void;
  setMusicSelection: (map: MusicSelectionMap) => void;
  setCurrentCharacterId: (id: CharacterId) => void;
  setPlaybackSetting: (setting: PlaybackSetting) => void;
  setNextSongPRNGSeed: (seed: number) => void;
  notifyTurnWinnerDetermined: (winner: Player | null) => void;
  notifyTurnStarted: (characterId: CharacterId) => void;
  notifyStartGame: (order: Array<CharacterId> | null) => Array<CharacterId>; // return the new playing order
  notifyNextTurnCountdown: () => void;
  notifyStopGame: () => void;
  notifyOuterEventHandler: (event: Event) => void;
  refresh: (judge: GameJudge) => void;
}

class GameJudge {

  // variables
  isServer: boolean;
  myName: string;
  opponentName: string;
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
    this.myName = "Player";
    this.opponentName = "Opponent";
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
    this.clientWaitAcknowledge = false;
  }

  adjustDeckSize(rows: number, columns: number, send: boolean): void {
    this.deckRows = rows;
    this.deckColumns = columns;
    const newSize = rows * columns;
    for (const player of [Alice, Bob]) {
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

  randomFillDeck(player: Player, send: boolean): void {
    const selectableCharacters = new Set<CharacterId>();
    this.playingOrder().forEach((characterId) => {
      selectableCharacters.add(characterId);
    });
    // remove that are already in deck
    this.deck.forEach((deck, _deckPlayer) => {
      deck.forEach((cardInfo, _index) => {
        if (cardInfo.characterId !== null) {
          selectableCharacters.delete(cardInfo.characterId);
        }
      });
    });
    for (let i = 0; i < this.deck[player].length; i++) {
      if (this.deck[player][i].characterId === null) {
        const selectableArray = Array.from(selectableCharacters);
        if (selectableArray.length === 0) {
          break;
        }
        const randomIndex = Math.floor(Math.random() * selectableArray.length);
        const characterId = selectableArray[randomIndex];
        const cardCount = this.g().globalData.characterConfigs.get(characterId)?.card.length || 1;
        const cardId = Math.floor(Math.random() * cardCount);
        selectableCharacters.delete(characterId);
        this.addToDeck(player, new CardInfo(characterId, cardId), i, send);
      }
    }
  }

  clearDeck(player: Player, send: boolean): void {
    for (let i = 0; i < this.deck[player].length; i++) {
      this.removeFromDeck(player, this.deck[player][i], send);
    }
  }

  shuffleDeck(player: Player, send: boolean): void {
    const filledCards: Array<CardInfo> = [];
    for (const cardInfo of this.deck[player]) {
      if (cardInfo.characterId !== null) {
        filledCards.push(cardInfo);
        this.removeFromDeck(player, cardInfo, send);
      }
    }
    const emptySlots = new Set<number>();
    for (let i = 0; i < this.deck[player].length; i++) {
      emptySlots.add(i);
    }
    while (filledCards.length > 0) {
      const randomCardIndex = Math.floor(Math.random() * filledCards.length);
      const cardInfo = filledCards.splice(randomCardIndex, 1)[0];
      const emptySlotsArray = Array.from(emptySlots);
      const randomSlotIndex = Math.floor(Math.random() * emptySlotsArray.length);
      const slot = emptySlotsArray[randomSlotIndex];
      emptySlots.delete(slot);
      this.addToDeck(player, cardInfo, slot, send);
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
    // check if the card is already in deck
    for (const player of [Alice, Bob]) {
      for (const existingCardInfo of this.deck[player]) {
        if (existingCardInfo.equals(cardInfo)) {
          return false;
        }
      }
    }
    // check if the card is already in collected
    for (const player of [Alice, Bob]) {
      for (const existingCardInfo of this.collectedCards[player]) {
        if (existingCardInfo.equals(cardInfo)) {
          return false;
        }
      }
    }
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

  isGameFinished(): boolean {
    if (!this.hasOpponent()) {
      return this.isDeckEmpty(Alice);
    }
    if (this.traditionalMode) {
      // check if someone has deck empty
      return this.givesLeft === 0 && (this.isDeckEmpty(Alice) || this.isDeckEmpty(Bob));
    } else {
      // check if all deck is empty
      return this.isDeckEmpty(Alice) && this.isDeckEmpty(Bob);
    }
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
    console.log("[GameJudge] Moving to next turn.");
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
        const syncData = this.buildSyncData(newPlayingOrder);
        const prngseed = Math.floor(Math.random() * 2147483647);
        this.g().peer.sendEvent({
          type: "syncStart",
          data: syncData,
          traditionalMode: this.traditionalMode,
          randomStartPosition: this.g().playbackSetting.randomStartPosition,
          playbackDuration: this.g().playbackSetting.playbackDuration,
          rngSeed: prngseed,
        });
        this.g().setNextSongPRNGSeed(prngseed);
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
    if (this.confirmations.start.all(this.hasRemotePlayer())) {
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

  calculateGivesFromPickEvents(correctCardOnSide: Player | null): boolean {
    if (!this.hasOpponent()) {
      this.givesLeft = 0;
      return false;
    }
    // non-traditional mode does not involve giving cards.
    if (!this.traditionalMode) { 
      this.givesLeft = 0;
      return false;
    }
    const currentCharacterId = this.currentCharacterId();
    let net = 0;
    for (const event of this.pickEvents) {
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
        if (event.player === Alice && correctCardOnSide === Bob) {
          net += 1;
        }
        if (event.player === Bob && correctCardOnSide === Alice) {
          net -= 1;
        }
      }
    }
    if (net > 0) {
      // check how many empty slots Bob has. if less than net, limit to that.
      let emptySlots = 0;
      for (const cardInfo of this.deck[Bob]) {
        if (cardInfo.characterId === null) {
          emptySlots += 1;
        }
      }
      net = Math.min(net, emptySlots);
      // check how many cards Alice has. if less than net, limit to that.
      let cardCount = 0;
      for (const cardInfo of this.deck[Alice]) {
        if (cardInfo.characterId !== null) {
          cardCount += 1;
        }
      }
      net = Math.min(net, cardCount);
    }
    if (net < 0) {
      // check how many empty slots Alice has. if less than -net, limit to that.
      let emptySlots = 0;
      for (const cardInfo of this.deck[Alice]) {
        if (cardInfo.characterId === null) {
          emptySlots += 1;
        }
      }
      net = Math.max(net, -emptySlots);
      // check how many cards Bob has. if less than -net, limit to that.
      let cardCount = 0;
      for (const cardInfo of this.deck[Bob]) {
        if (cardInfo.characterId !== null) {
          cardCount += 1;
        }
      }
      net = Math.max(net, -cardCount);
    }
    this.givesLeft = net;
    console.log("givesleft = ", this.givesLeft);
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
    for (const event of this.pickEvents) {
      if (event.characterId() === currentCharacterId) {
        this.turnWinner = event.player;
        winnerFound = true;
        break;
      }
    }
    if (winnerFound) {
      this.state = GameJudgeState.TurnWinnerDetermined;
      let correctCardOnSide: Player | null = null;
      // collect card to collected
      if (this.turnWinner !== null) {
        let found = null;
        for (const deckPlayer of [Alice, Bob]) {
          for (const cardInfo of this.deck[deckPlayer]) {
            if (cardInfo.characterId === currentCharacterId) {
              this.collectedCards[this.turnWinner].push(cardInfo);
              found = cardInfo;
              correctCardOnSide = deckPlayer as Player;
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
      this.calculateGivesFromPickEvents(correctCardOnSide);
      // send sync winner determined
      if (this.hasRemotePlayer() && this.isServer) {
        const syncData = this.buildSyncData();
        this.g().peer.sendEvent({
          type: "syncWinnerDetermined",
          data: syncData,
        });
      }
      this.g().notifyTurnWinnerDetermined(this.turnWinner);
    }
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
    for (const cardInfo of this.deck[player]) {
      if (cardInfo.characterId === null) {
        return false;
      }
    }
    return true;
  }

  isDeckEmpty(player: Player): boolean {
    for (const cardInfo of this.deck[player]) {
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
    const ok = this.finishTurn();
    if (!ok) {
      this.g().refresh(this);
      return;
    }
    this.countdownNextTurn();
    this.g().notifyNextTurnCountdown();
    this.g().refresh(this);
  }

  // sendNextTurnSync(playbackCurrentTime: number): void {
  //   if (this.hasRemotePlayer()) {
  //     const syncData = this.buildSyncData();
  //     this.g().peer.sendEvent({
  //       type: "syncNextTurn",
  //       data: syncData,
  //       playbackCurrentTime: playbackCurrentTime,
  //     });
  //   }
  // }

  _clientNextTurn(): void {
    this.confirmations.next = new GameConfirmation();
    if (this.isGeneralServer()) { 
      if (this.hasRemotePlayer()) {
        // send
        const syncData = this.buildSyncData();
        const prngseed = Math.floor(Math.random() * 2147483647);
        this.g().peer.sendEvent({
          type: "syncNextTurn",
          data: syncData,
          rngSeed: prngseed,
        });
        this.g().setNextSongPRNGSeed(prngseed);
      }
      this._serverNextTurn(); 
      return; 
    }
    this.clientWaitAcknowledge = true;
  }

  giveCardsRandomly(send: boolean): void {
    if (this.givesLeft != 0) {
      // process gives arbitrarily for CPU
      let givesLeft = this.givesLeft;
      const giver: Player = givesLeft > 0 ? Alice : Bob;
      const receiver: Player = givesLeft > 0 ? Bob : Alice;
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
        this.moveCard(giver, cardInfo, receiver, toIndex, send);
        givesLeft -= 1;
        if (this.givesLeft > 0 && send && this.hasRemotePlayer()) {
          this.g().peer.sendEvent({
            type: "give",
          });
        }
      }
      this.givesLeft = 0;
      this.g().refresh(this);
    }
  }

  finishTurn(): boolean {
    if (this.state === GameJudgeState.TurnWinnerDetermined) {
      if (this.opponentType === OpponentType.CPU && this.givesLeft != 0) {
        this.giveCardsRandomly(false);
      }
      return true;
    }
    if (this.state === GameJudgeState.TurnStart) {
      // no winner this turn
      // check if the correct answer is in the deck. if so, remove it.
      const currentCharacterId = this.currentCharacterId();
      let correctCardOnSide: Player | null = null;
      for (const player of [Alice, Bob]) {
        for (let i = 0; i < this.deck[player].length; i++) {
          const cardInfo = this.deck[player][i];
          if (cardInfo.characterId === currentCharacterId) {
            // remove from deck
            this.removeFromDeck(player as Player, cardInfo, false);
            correctCardOnSide = player as Player;
            break;
          }
        }
      }
      this.calculateGivesFromPickEvents(correctCardOnSide);
      if (this.givesLeft !== 0) {
        this.state = GameJudgeState.TurnWinnerDetermined;
        this.g().notifyTurnWinnerDetermined(this.turnWinner);
        return false;
      }
    }
    return true;
  }
  
  confirmNext(player: Player): {judgeChanged: boolean, nextTurn: boolean} {
    if (this.confirmations.next.ok[player]) {
      return {judgeChanged: false, nextTurn: false};
    }
    this.confirmations.next.ok[player] = true;
    if (this.hasRemotePlayer()) {
      this.g().peer.sendEvent({
        type: "confirmNext",
      });
    }
    if (this.confirmations.next.all(this.hasRemotePlayer())) {
      this._clientNextTurn();
      return {judgeChanged: true, nextTurn: true};
    }
    return {judgeChanged: true, nextTurn: false};
  }

  buildSyncData(
    overwritePlayingOrder: Array<CharacterId> | null = null
  ): SyncData {
    const baseData: SyncData = {
      deck: this.deck,
      deckRows: this.deckRows,
      deckColumns: this.deckColumns,
      turnWinner: this.turnWinner,
      order: new Array<{ 
        characterId: CharacterId;
        musicSelection: number;
        temporaryDisabled: boolean;
      }>(),
      pickEvents: this.pickEvents,
      collectedCards: this.collectedCards,
      currentCharacterId: this.currentCharacterId(),
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
    return baseData;
  } 

  sendStopGame(): void {
    if (this.hasRemotePlayer()) {
      this.g().peer.sendEvent({
        type: "stopGame",
      });
    }
  }

  resetGameState() {
    this.state = GameJudgeState.SelectingCards;
    this.confirmations = {
      start: new GameConfirmation(),
      next: new GameConfirmation(),
    };
    this.turnWinner = null;
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
    }
    this.countdownTimeout = null;
    this.turnStartTimestamp = null;
    this.pickEvents = [];
    this.collectedCards = [[], []];
    this.givesLeft = 0;
    this.clientWaitAcknowledge = false;
    this.deck = [[], []];
    for (let i = 0; i < this.deckRows * this.deckColumns; i++) {
      this.deck[Alice].push(new CardInfo(null, 0));
      this.deck[Bob].push(new CardInfo(null, 0));
    }
  }

  simulateCPUOpponentPick(mistake: boolean): void {
    if (this.opponentType !== OpponentType.CPU) {
      return;
    }
    if (this.state !== GameJudgeState.TurnStart) {
      return;
    }
    const currentCharacterId = this.currentCharacterId();
    if (!mistake) {
      // pick the correct card from any deck
      for (const player of [Alice, Bob]) {
        for (const cardInfo of this.deck[player]) {
          if (cardInfo.characterId === currentCharacterId) {
            this.notifyPickEvent(new PickEvent(
              Date.now(),
              Bob,
              cardInfo,
            ), true);
            return;
          }
        }
      }
    } else {
      // pick a wrong card from any deck
      const selectableCardInfos: Array<CardInfo> = [];
      for (const player of [Alice, Bob]) {
        for (const cardInfo of this.deck[player]) {
          if (cardInfo.characterId !== null && cardInfo.characterId !== currentCharacterId) {
            selectableCardInfos.push(cardInfo);
          }
        }
      }
      if (selectableCardInfos.length > 0) {
        const randomIndex = Math.floor(Math.random() * selectableCardInfos.length);
        const cardInfo = selectableCardInfos[randomIndex];
        this.notifyPickEvent(new PickEvent(
          Date.now(),
          Bob,
          cardInfo,
        ), true);
      }
    }
  }

  isMusicFilteredByDeck(): boolean {
    // check all cards that is not inside deck is disabled in temporary
    const playingOrder = this.playingOrder();
    const characterTemporaryDisabled = this.characterTemporaryDisabled();
    const inDeck = new Set<CharacterId>();
    for (const player of [Alice, Bob]) {
      for (const cardInfo of this.deck[player]) {
        if (cardInfo.characterId !== null) {
          inDeck.add(cardInfo.characterId);
        }
      }
      for (const cardInfo of this.collectedCards[player]) {
        if (cardInfo.characterId !== null) {
          inDeck.add(cardInfo.characterId);
        }
      }
    }
    for (const characterId of playingOrder) {
      const isDisabled = characterTemporaryDisabled.get(characterId) || false;
      const isInDeck = inDeck.has(characterId);
      if (!isInDeck && !isDisabled) {
        return false;
      }
    }
    return true;
  }

  filterMusicByDeck() {
    // disable all characters that are not in deck
    const playingOrder = this.playingOrder();
    const inDeck = new Set<CharacterId>();
    for (const player of [Alice, Bob]) {
      for (const cardInfo of this.deck[player]) {
        if (cardInfo.characterId !== null) {
          inDeck.add(cardInfo.characterId);
        }
      }
      for (const cardInfo of this.collectedCards[player]) {
        if (cardInfo.characterId !== null) {
          inDeck.add(cardInfo.characterId);
        }
      }
    }
    const newTemporaryDisabled: Map<CharacterId, boolean> = new Map<CharacterId, boolean>();
    for (const characterId of playingOrder) {
      const isInDeck = inDeck.has(characterId);
      newTemporaryDisabled.set(characterId, !isInDeck);
    }
    this.g().setCharacterTemporaryDisabled(newTemporaryDisabled);
  }

  // this function is used to be passed to the GamePeer object.
  remoteEventListener(data: unknown): void {

    // Reverse Role
    const cRole = (i: Player) => i === Alice ? Bob : Alice;

    const applySyncData = (data: SyncData) => {
      this.deck = data.deck;
      this.deckRows = data.deckRows;
      this.deckColumns = data.deckColumns;
      this.turnWinner = data.turnWinner;
      this.pickEvents = data.pickEvents;
      this.collectedCards = data.collectedCards;
      const newOrder: Array<CharacterId> = [];
      const newMusicSelection: Map<CharacterId, number> = new Map<CharacterId, number>();
      const newTemporaryDisabled: Map<CharacterId, boolean> = new Map<CharacterId, boolean>();
      for (const item of data.order) {
        newOrder.push(item.characterId);
        newMusicSelection.set(item.characterId, item.musicSelection);
        newTemporaryDisabled.set(item.characterId, item.temporaryDisabled);
      }
      // check if neworder is same, if so, don't set
      {
        let same = true;
        const currentOrder = this.playingOrder();
        if (currentOrder.length !== newOrder.length) {
          same = false;
        } else {
          for (let i = 0; i < currentOrder.length; i++) {
            if (currentOrder[i] !== newOrder[i]) {
              same = false;
              break;
            }
          }
        }
        if (!same) {
          this.g().setPlayingOrder(newOrder);
        }
      }
      // check if music selection is same, if so, don't set
      {
        let same = true;
        const currentMusicSelection = this.g().musicSelection;
        if (currentMusicSelection.size !== newMusicSelection.size) {
          same = false;
        } else {
          for (const [key, value] of currentMusicSelection) {
            if (newMusicSelection.get(key) !== value) {
              same = false;
              break;
            }
          }
        }
        if (!same) {
          this.g().setMusicSelection(newMusicSelection);
        }
      }
      // check if temporary disabled is same, if so, don't set
      {
        let same = true;
        const currentTemporaryDisabled = this.characterTemporaryDisabled();
        if (currentTemporaryDisabled.size !== newTemporaryDisabled.size) {
          same = false;
        } else {
          for (const [key, value] of currentTemporaryDisabled) {
            if (newTemporaryDisabled.get(key) !== value) {
              same = false;
              break;
            }
          }
        }
        if (!same) {
          this.g().setCharacterTemporaryDisabled(newTemporaryDisabled);
        }
      }
      // check current character id
      if (this.currentCharacterId() !== data.currentCharacterId) {
        this.g().setCurrentCharacterId(data.currentCharacterId!);
      }
    }

    const event = JSON.parse(data as string) as Event;
    console.log("[GameJudge] Received event:", event);
    switch (event.type) {
      case "addCard": {
        const e = event as EventAddCard;
        e.cardInfo = new CardInfo(e.cardInfo.characterId, e.cardInfo.cardIndex);
        const result = this.addToDeck(cRole(e.deckPosition.deckIndex), e.cardInfo, e.deckPosition.cardIndex, false);
        if (result) { this.g().refresh(this); }
        else {
          if (this.hasRemotePlayer()) {
            if (this.isServer) {
              // if server, send self data to client
              const syncData = this.buildSyncData();
              this.g().peer.sendEvent({
                type: "syncData",
                data: syncData,
              });
            } else {
              // request server to send sync data
              this.g().peer.sendEvent({
                type: "requestSyncData",
              });
            }
          }
        }
        break;
      }
      case "removeCard": {
        const e = event as EventRemoveCard;
        e.cardInfo = new CardInfo(e.cardInfo.characterId, e.cardInfo.cardIndex);
        const result = this.removeFromDeck(cRole(e.deckPosition.deckIndex), e.cardInfo, false);
        if (result) { this.g().refresh(this); }
        else {
          if (this.hasRemotePlayer()) {
            if (this.isServer) {
              // if server, send self data to client
              const syncData = this.buildSyncData();
              this.g().peer.sendEvent({
                type: "syncData",
                data: syncData,
              });
            } else {
              // request server to send sync data
              this.g().peer.sendEvent({
                type: "requestSyncData",
              });
            }
          }
        }
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
        if (this.confirmations.start.all(this.hasRemotePlayer())) {
          this._clientStartGame();
        }
        break;
      }
      case "confirmNext": {
        this.confirmations.next.ok[Bob] = true;
        if (this.confirmations.next.all(this.hasRemotePlayer())) {
          this.confirmations.next = new GameConfirmation();
          this._clientNextTurn();
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
      case "stopGame": {
        this.g().notifyStopGame();
        this.g().refresh(this);
        break;
      }
      case "syncWinnerDetermined": case "syncStart": case "syncNextTurn": case "syncData": {
        let e: EventSyncWinnerDetermined | EventSyncStart | EventSyncNextTurn | EventSyncData;
        if (event.type === "syncWinnerDetermined") {
          e = event as EventSyncWinnerDetermined;
        } else if (event.type === "syncStart") {
          this.clientWaitAcknowledge = false;
          e = event as EventSyncStart;
          this.traditionalMode = e.traditionalMode;
          this.g().setPlaybackSetting({
            ...this.g().playbackSetting,
            randomStartPosition: e.randomStartPosition,
            playbackDuration: e.playbackDuration,
          })
          this.g().setNextSongPRNGSeed(e.rngSeed);
        } else if (event.type === "syncNextTurn") {
          this.clientWaitAcknowledge = false;
          e = event as EventSyncNextTurn;
          this.g().setNextSongPRNGSeed(e.rngSeed);
        } else {
          e = event as EventSyncData;
        }
        // reverse the sync data
        const data = reverseSyncData(e.data);
        // apply the sync data
        applySyncData(data);
        if (event.type === "syncStart") {
          const newOrder = data.order.map(item => item.characterId);
          this._serverStartGame(newOrder);
        } else if (event.type === "syncNextTurn") {
          this._serverNextTurn();
        }
        this.g().refresh(this);
        break;
      }
      case "switchTraditionalMode": {
        const e = event as EventSwitchTraditionalMode;
        this.traditionalMode = e.traditionalMode;
        this.g().refresh(this);
        break;
      }
      case "give": {
        if (this.givesLeft < 0) {
          this.givesLeft += 1;
          this.g().refresh(this);
        }
        break;
      }
      case "syncSettings": {
        const e = event as EventSyncSettings;
        this.traditionalMode = e.traditionalMode;
        this.deckRows = e.deckRows;
        this.deckColumns = e.deckColumns;
        this.resetGameState();
        this.g().refresh(this);
        break;
      }
      case "filterMusicByDeck": {
        this.filterMusicByDeck();
        break;
      }
      case "notifyName": {
        const e = event as EventNotifyName;
        this.opponentName = e.name;
        this.g().refresh(this);
        break;
      }
    }
    this.outerRef.current?.notifyOuterEventHandler(event);
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
export type {
  Event, EventAddCard, EventRemoveCard,
  EventAdjustDeckSize, EventConfirmStart,
  EventConfirmNext, EventPickEvent,
  EventSyncWinnerDetermined, EventSyncStart,
  EventSyncNextTurn, EventStopGame,
  EventSwitchTraditionalMode,
  EventGive,
}