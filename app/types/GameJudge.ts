import { RefObject } from "react";
import { CharacterId, GlobalData, MusicSelectionMap, PlaybackSetting } from "./Configs";
import {
  CardInfo, DeckPosition, DontSend, GameJudgeState, MatchType, PickEvent,
  Player, PlayerInfo, SendOption, SendToAll,
} from "./GameTypes";
import {
  Event, EventAddCard, EventAdjustDeckSize, EventBroadcastPlayerNames, EventChat,
  EventClearDeck, EventConfirmNext, EventConfirmStart, EventGive, EventNotifyName,
  EventPickEvent, EventRemoveCard, EventStopGame, EventSwitchTraditionalMode,
  EventSyncData, EventSyncNextTurn, EventSyncSettings, EventSyncStart,
  EventSyncWinnerDetermined, SyncData,
} from "./GameEvents";
import { ClientConnection, GamePeer } from "./GamePeer";

// Rules engine for a match: decks, turn order, picks, scoring and CPU behaviour.
// Networking lives in GamePeer, the wire format in syncCodec, and the shared value
// types in GameTypes.

type OuterRefObject = {

  globalData: GlobalData;
  playingOrder: Array<CharacterId>;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  currentCharacterId: CharacterId;
  musicSelection: Map<CharacterId, number>;
  playbackSetting: PlaybackSetting;
  /** Timestamp the current turn's music started, or 0 when nothing has played yet. */
  musicStartTimestamp: number;

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
  notifyOuterEventHandler: (sender: number, event: Event) => void;

  /**
   * Publishes a change to React (bumps `judgeVersion`). Called at most once per user-visible
   * change: by the session layer after it invokes a rule, or from a deferred callback the rules
   * engine owns (the next-turn timer). Never from a synchronous rule method - the caller decides
   * when the object is in a consistent state to be published.
   */
  refresh: () => void;
}

class GameJudge {

  // variables

  myPlayerIndex: Player;

  matchType: MatchType;
  players: Array<PlayerInfo>;

  traditionalMode: boolean;
  state: GameJudgeState;

  turnWinner: Player | null;
  countdownTimeout: NodeJS.Timeout | null;
  
  outerRef: RefObject<OuterRefObject>;

  deckRows: number;
  deckColumns: number;

  turnStartTimestamp: number | null;

  /**
   * When the current turn's music started, falling back to when the turn was picked. Both the
   * rules and the session stamp picks against this so a pick's reaction time means the same
   * thing everywhere.
   */
  turnStartedAt(): number {
    return this.g().musicStartTimestamp || this.turnStartTimestamp || 0;
  }

  pickEvents: Array<PickEvent>;

  clientWaitAcknowledge: boolean;

  // only useful when there is one opponent (either CPU or RemotePlayer)
  // number of cards to for the SERVER (Player 0)
  // to give to the sole CLIENT (Player 1)
  // Note that is a observer is connected before a game client,
  // the client should be moved to the first.
  givesLeft: number;

  isServer(): boolean { return this.matchType === MatchType.Server; }
  isClient(): boolean { return this.matchType === MatchType.Client; }
  isObserver(): boolean { return this.matchType === MatchType.Observer; }

  clearTimeouts(): void {
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
      this.countdownTimeout = null;
    }
  }

  stopGame(): void {
    this.clearTimeouts();
    this.state = GameJudgeState.SelectingCards;
    this.turnWinner = null;
    this.turnStartTimestamp = null;
    this.pickEvents = [];
    this.givesLeft = 0;
    // reset all opponents's confirmation and collected cards
    for (const opponent of this.players) {
      opponent.confirmation = {start: false, next: false};
      opponent.collected = [];
    }
  }

  constructor(outerRef: RefObject<OuterRefObject>) {
    this.myPlayerIndex = 0;
    this.players = [];
    this.traditionalMode = true; 
    this.matchType = MatchType.None;
    this.state = GameJudgeState.SelectingCards;
    this.turnWinner = null;
    this.countdownTimeout = null;
    this.outerRef = outerRef;
    this.deckRows = 3;
    this.deckColumns = 8;
    
    // create one player indicading self.
    const player = {
      name: "Player",
      isObserver: false,
      confirmation: {start: false, next: false},
      deck: [],
      collected: [],
    } as PlayerInfo;
    for (let i = 0; i < this.deckRows * this.deckColumns; i++) {
      player.deck.push(new CardInfo(null, 0));
    }
    this.players.push(player);

    this.turnStartTimestamp = null;
    this.pickEvents = [];
    this.givesLeft = 0;
    this.clientWaitAcknowledge = false;
  }

  isServerClientObserverMode(): boolean {
    return this.matchType === MatchType.Server ||
      this.matchType === MatchType.Client ||  
      this.matchType === MatchType.Observer;
  }

  sendEvent(event: Event, sendOpt: SendOption) {
    if (this.matchType == MatchType.None || this.matchType == MatchType.CPU) {
      return;
    }
    if (sendOpt.send === false) {
      return;
    }
    const peer = this.g().peer;
    if (this.isServer()) {
      peer.sendEventToClients(event, sendOpt.except);
    } else if (this.isClient()) {
      peer.sendEventToServer(event);
    }
  }

  sendEventToServer(event: Event) {
    if (this.matchType == MatchType.None || this.matchType == MatchType.CPU || this.isServer()) {
      return;
    }
    const peer = this.g().peer;
    peer.sendEventToServer(event);
  }

  sendServerEventTo(event: Event, to: Player) {
    if (this.matchType == MatchType.None || this.matchType == MatchType.CPU) {
      return;
    }
    if (!this.isServer()) {
      console.warn("[GameJudge.sendServerEventTo] Only server can send server events to clients.");
      return;
    }
    const peer = this.g().peer;
    peer.sendEventToClient(event, to);
  }

  adjustDeckSize(rows: number, columns: number, sendOpt: SendOption): void {

    this.deckRows = rows;
    this.deckColumns = columns;
    const newSize = rows * columns;

    // adjust deck size of each player
    for (const player of this.players) {
      const currentDeck = player.deck;
      if (currentDeck.length > newSize) {
        player.deck = currentDeck.slice(0, newSize);
      } else if (currentDeck.length < newSize) {
        for (let i = currentDeck.length; i < newSize; i++) {
          player.deck.push(new CardInfo(null, 0));
        }
      }
    }
    
    // send?
    if (sendOpt.send) {
      const event: EventAdjustDeckSize = { 
        type: "adjustDeckSize", rows: rows, columns: columns 
      };
      this.sendEvent(event, sendOpt);
    }
  }

  /**
   * The characters a random fill may still put on a deck: every character the board offers while
   * the lineup is being built (soundtrack not disabled), minus the ones already sitting in a deck
   * or a collected pile, because a character may appear only once across the two decks.
   *
   * The playing order is deliberately not the source: it is a snapshot that goes stale (restored
   * storage, characters added to the dataset since), while the selectable row under the board
   * always offers the live set - and starting a match rebuilds the order from the character list
   * anyway, so a stale order would only make Random Fill refuse cards the board happily accepts.
   */
  selectableCharactersForFill(
    musicSelection: MusicSelectionMap = this.g().musicSelection,
  ): Set<CharacterId> {
    const selectable = new Set<CharacterId>();
    this.g().globalData.characterConfigs.forEach((config, characterId) => {
      if (musicSelection.get(characterId) === -1) { return; }
      if (config.card.length === 0) { return; }
      selectable.add(characterId);
    });
    for (const player of this.players) {
      for (const cardInfo of player.deck) {
        if (cardInfo.characterId !== null) { selectable.delete(cardInfo.characterId); }
      }
      for (const cardInfo of player.collected) {
        if (cardInfo.characterId !== null) { selectable.delete(cardInfo.characterId); }
      }
    }
    return selectable;
  }

  /** Whether Random Fill could still place a card on this deck. */
  canRandomFill(
    player: Player, musicSelection: MusicSelectionMap = this.g().musicSelection,
  ): boolean {
    if (player < 0 || player >= 2 || player >= this.players.length) { return false; }
    if (this.isDeckFull(player)) { return false; }
    return this.selectableCharactersForFill(musicSelection).size > 0;
  }

  randomFillDeck(player: Player, sendOpt: SendOption): void {

    if (player < 0 || player >= 2 || player >= this.players.length) {
      console.warn(`[GameJudge.randomFillDeck] Invalid player index: ${player}`);
      return;
    }

    const selectableCharacters = this.selectableCharactersForFill();

    // fill in every card
    for (let i = 0; i < this.players[player].deck.length; i++) {
      if (this.players[player].deck[i].characterId !== null) { continue; }
      if (!this.fillDeckSlot(player, i, selectableCharacters, sendOpt)) { break; }
    }

  }

  /**
   * Puts one card of a not-yet-used character into `index`. A character the rules refuse costs
   * only itself, never the slot: the next candidate is tried, so a stray rejection cannot leave a
   * hole while other characters are still selectable.
   */
  fillDeckSlot(
    player: Player, index: number, selectableCharacters: Set<CharacterId>, sendOpt: SendOption,
  ): boolean {
    while (selectableCharacters.size > 0) {
      const selectableArray = Array.from(selectableCharacters);
      const characterId = selectableArray[Math.floor(Math.random() * selectableArray.length)];
      selectableCharacters.delete(characterId);
      const cardCount = this.g().globalData.characterConfigs.get(characterId)?.card.length ?? 0;
      if (cardCount === 0) { continue; }
      const cardId = Math.floor(Math.random() * cardCount);
      if (this.addToDeck(player, new CardInfo(characterId, cardId), index, sendOpt)) {
        return true;
      }
    }
    return false;
  }

  clearDeck(player: Player, sendOpt: SendOption): boolean {
    if (player < 0 || player >= 2) {
      console.warn(`[GameJudge.clearDeck] Invalid player index: ${player}`);
      return false;
    }
    let changed = false;
    for (let i = 0; i < this.players[player].deck.length; i++) {
      const cardInfo = this.players[player].deck[i];
      if (cardInfo.characterId === null) {
        continue;
      }
      changed = true;
      this.removeFromDeck(player, i, sendOpt);
    }
    if (changed) {
      const event : EventClearDeck = {
        type: "clearDeck",
        player: player,
      };
      this.sendEvent(event, sendOpt);
    }
    return changed;
  }

  shuffleDeck(player: Player, sendOpt: SendOption): void {
    if (player < 0 || player >= 2) {
      console.warn(`[GameJudge.shuffleDeck] Invalid player index: ${player}`);
      return;
    }
    const filledCards: Array<CardInfo> = [];
    for (let index = 0; index < this.players[player].deck.length; index++) {
      const cardInfo = this.players[player].deck[index];
      if (cardInfo.characterId !== null) {
        filledCards.push(cardInfo);
      }
    }
    this.clearDeck(player, sendOpt);
    const emptySlots = new Set<number>();
    for (let i = 0; i < this.players[player].deck.length; i++) {
      emptySlots.add(i);
    }
    while (filledCards.length > 0) {
      const randomCardIndex = Math.floor(Math.random() * filledCards.length);
      const cardInfo = filledCards.splice(randomCardIndex, 1)[0];
      const emptySlotsArray = Array.from(emptySlots);
      const randomSlotIndex = Math.floor(Math.random() * emptySlotsArray.length);
      const slot = emptySlotsArray[randomSlotIndex];
      emptySlots.delete(slot);
      this.addToDeck(player, cardInfo, slot, sendOpt);
    }
  }


  removeFromDeck(player: Player, index: number, sendOpt: SendOption): boolean {
    if (player < 0 || player >= 2) {
      console.warn(`[GameJudge.removeFromDeck] Invalid player index: ${player}`);
      return false;
    }
    if (index < 0 || index >= this.players[player].deck.length) {
      console.warn(`[GameJudge.removeFromDeck] Invalid card index: ${index}`);
      return false;
    }
    if (this.players[player].deck[index].characterId === null) {
      console.warn(`[GameJudge.removeFromDeck] No card to remove at index: ${index}`);
      return false;
    }
    this.players[player].deck[index] = new CardInfo(null, 0);
    if (sendOpt.send) {
      const event: EventRemoveCard = {
        type: "removeCard",
        deckPosition: {deckIndex: player as 0 | 1, cardIndex: index},
      };
      this.sendEvent(event, sendOpt);
    }
    return true;
  }

  getDeck(player: Player, index: number): CardInfo | null {
    if (index < 0 || index >= this.players[player].deck.length) {
      console.warn(`[GameJudge.getDeck] Invalid card index: ${index}`);
      return null;
    }
    const v = this.players[player].deck[index];
    if (v.characterId === null) {
      return null;
    }
    return v;
  }

  playerSpecificationToList(player: null | Player | Array<Player>, only01: boolean): Array<Player> {
    const playersToCheck: Array<Player> = [];
    if (player === null) {
      if (only01) {
        playersToCheck.push(0);
        if (this.players.length > 1) {
          playersToCheck.push(1);
        }
      } else {
        for (let p = 0; p < this.players.length; p++) {
          playersToCheck.push(p);
        }
      }
    } else if (Array.isArray(player)) {
      for (const p of player) {
        if (p < 0 || p >= 2) {
          console.warn(`[GameJudge.playerSpecificationToList] Invalid player index: ${p}`);
          continue;
        }
        playersToCheck.push(p);
      }
    } else {
      if (player < 0 || player >= 2) {
        console.warn(`[GameJudge.playerSpecificationToList] Invalid player index: ${player}`);
        return [];
      }
      playersToCheck.push(player);
    }
    return playersToCheck;
  }



  getDeckCardSet(player: null | Player | Array<Player>): Set<string> {
    const result = new Set<string>();
    const playersToCheck: Array<Player> = this.playerSpecificationToList(player, true);
    for (const p of playersToCheck) {
      for (const cardInfo of this.players[p].deck) {
        if (cardInfo.characterId !== null) {
          result.add(cardInfo.toKey());
        }
      }
    }
    return result;
  }

  getCollectedCardSet(player: null | Player | Array<Player>): Set<string> {
    const result = new Set<string>();
    const playersToCheck: Array<Player> = this.playerSpecificationToList(player, true);
    for (const p of playersToCheck) {
      for (const cardInfo of this.players[p].collected) {
        if (cardInfo.characterId !== null) {
          result.add(cardInfo.toKey());
        }
      }
    }
    return result;
  }

  isInDeck(player: null | Player | Array<Player>, cardInfo: CardInfo): boolean {
    const playersToCheck: Array<Player> = this.playerSpecificationToList(player, true);
    for (const p of playersToCheck) {
      for (const existingCardInfo of this.players[p].deck) {
        if (existingCardInfo.equals(cardInfo)) {
          return true;
        }
      }
    }
    return false;
  }

  isInCollected(player: null | Player | Array<Player>, cardInfo: CardInfo): boolean {
    const playersToCheck: Array<Player> = this.playerSpecificationToList(player, true);
    for (const p of playersToCheck) {
      for (const existingCardInfo of this.players[p].collected) {
        if (existingCardInfo.equals(cardInfo)) {
          return true;
        }
      }
    }
    return false;
  }

  getDeckCardCount(player: Player): number {
    if (player < 0 || player >= 2) {
      console.warn(`[GameJudge.getDeckCardCount] Invalid player index: ${player}`);
      return 0;
    }
    let count = 0;
    for (const cardInfo of this.players[player].deck) {
      if (cardInfo.characterId !== null) {
        count += 1;
      }
    }
    return count;
  }

  getDeckEmptyCount(player: Player): number {
    if (player < 0 || player >= 2) {
      console.warn(`[GameJudge.getDeckEmptyCount] Invalid player index: ${player}`);
      return 0;
    }
    let count = 0;
    for (const cardInfo of this.players[player].deck) {
      if (cardInfo.characterId === null) {
        count += 1;
      }
    }
    return count;
  }

  findFirstNullIndexInDeck(player: Player): number | null {
    for (let i = 0; i < this.players[player].deck.length; i++) {
      if (this.players[player].deck[i].characterId === null) {
        return i;
      }
    }
    return null;
  }

  addToDeck(player: Player, cardInfo: CardInfo, toIndex: number | null, sendOpt: SendOption): boolean {
    
    // check if the card is already in deck or collected
    if (this.isInDeck(null, cardInfo) || this.isInCollected(null, cardInfo)) {
      return false;
    }

    // if toIndex is null, add to first empty slot
    if (toIndex === null) {
      toIndex = this.findFirstNullIndexInDeck(player);
    }
    if (toIndex === null) { return false; }

    this.players[player].deck[toIndex] = cardInfo;

    if (sendOpt.send) {
      const event: EventAddCard = {
        type: "addCard",
        cardInfo: cardInfo,
        deckPosition: {deckIndex: player as 0 | 1, cardIndex: toIndex},
      };
      this.sendEvent(event, sendOpt);
    }
    return true;
  }

  isGameFinished(): boolean {
    const isMelee = this.isMelee();
    if (this.matchType === MatchType.None || isMelee) {
      return this.isDeckEmpty(0);
    }
    if (this.givesLeft !== 0) { return false; }
    if (this.traditionalMode) {
      // check if someone has deck empty
      return this.isDeckEmpty(0) || (this.players.length >= 2 && this.isDeckEmpty(1));
    } else {
      // check if all deck is empty
      return this.isDeckEmpty(0) && (this.players.length >= 2 && this.isDeckEmpty(1));
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

  _serverStartGame(order: Array<CharacterId> | null): Array<CharacterId> {
    this.countdownNextTurn(true);
    return this.g().notifyStartGame(order);
  }

  _clientStartGame(): void {

    // reset all players' start confirmations
    for (const player of this.players) {
      player.confirmation.start = false;
    }

    if ([MatchType.None, MatchType.CPU, MatchType.Server].includes(this.matchType)) {

      // server generates the new order.
      const newPlayingOrder = this._serverStartGame(null); 

      if (this.matchType === MatchType.Server) {
        // actively send an ack with full data
        const syncData = this.buildSyncData(newPlayingOrder);
        const prngseed = Math.floor(Math.random() * 2147483647);
        const event = <EventSyncStart>{
          type: "syncStart",
          data: syncData,
          traditionalMode: this.traditionalMode,
          randomStartPosition: this.g().playbackSetting.randomStartPosition,
          playbackDuration: this.g().playbackSetting.playbackDuration,
          rngSeed: prngseed,
        };
        this.sendEvent(event, {send: true, except: null});
        this.g().setNextSongPRNGSeed(prngseed);
      }

    } else {

      this.clientWaitAcknowledge = true;

    }
    
  }

  checkAllStartConfirmed(): boolean {
    if (this.matchType === MatchType.None || this.matchType === MatchType.CPU) {
      return this.players[0].confirmation.start;
    }
    for (const player of this.players) {
      if (player.isObserver) { continue; }
      if (!player.confirmation.start) {
        return false;
      }
    }
    return true;
  }

  checkAnyStartConfirmed(): boolean {
    for (const player of this.players) {
      if (player.isObserver) { continue; }
      if (player.confirmation.start) {
        return true;
      }
    }
    return false;
  }

  confirmStart(player: Player): {judgeChanged: boolean, started: boolean} {

    if (this.matchType === MatchType.Observer) {
      console.warn(`[GameJudge.confirmStart] [P${player}] Observer cannot confirm start.`);
      return {judgeChanged: false, started: false};
    }

    if (this.state !== GameJudgeState.SelectingCards) {
      console.warn(`[GameJudge.confirmStart] [P${player}] Invalid state: ${this.state}`);
      return {judgeChanged: false, started: false};
    }

    this.players[player].confirmation.start = true;
    const event = <EventConfirmStart>{ type: "confirmStart", playerIndex: player };
    this.sendEvent(event, {send: true, except: null});

    if (this.checkAllStartConfirmed()) {
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

    if (correctCardOnSide !== null && (correctCardOnSide < 0 || correctCardOnSide > 1)) {
      console.warn(`[GameJudge.calculateGivesFromPickEvents] Invalid correctCardOnSide: ${correctCardOnSide}`);
      this.givesLeft = 0;
      return false;
    }

    if (
      this.matchType === MatchType.None  // no gives in these modes
      || !this.traditionalMode           // no gives in non-traditional mode
      || this.isMelee()                  // no gives in melee
    ) {
      this.givesLeft = 0; return false;
    }

    const currentCharacterId = this.currentCharacterId();
    let net = 0;
    for (const event of this.pickEvents) {
      // for each wrong pick, if 0, net - 1, if 1, net + 1
      if (event.characterId() !== currentCharacterId) {
        if (event.player === 0) {
          net -= 1;
        } else {
          net += 1;
        }
      } else { 
        // for the right pick:
        // if the pick is on the picking player's side of deck, net does not change.
        // otherwise, picker give one card to the opponent
        if (event.player === 0 && correctCardOnSide === 1) {
          net += 1;
        }
        if (event.player === 1 && correctCardOnSide === 0) {
          net -= 1;
        }
      }
    }
    if (net > 0) {
      // check how many empty slots P1 has. if less than net, limit to that.
      const emptySlots = this.getDeckEmptyCount(1);
      net = Math.min(net, emptySlots);
      // check how many cards P0 has. if less than net, limit to that.
      const cardCount = this.getDeckCardCount(0);
      net = Math.min(net, cardCount);
    }
    if (net < 0) {
      // check how many empty slots P0 has. if less than -net, limit to that.
      const emptySlots = this.getDeckEmptyCount(0);
      net = Math.max(net, -emptySlots);
      // check how many cards P1 has. if less than -net, limit to that.
      const cardCount = this.getDeckCardCount(1);
      net = Math.max(net, -cardCount);
    }
    console.log(`[GameJudge.calculateGivesFromPickEvents] Calculated gives left: ${net}`);
    this.givesLeft = net;
    return true;
  }

  notifyPickEvent(pickEvent: PickEvent, sendOpt: SendOption): boolean {
    const currentCharacterId = this.currentCharacterId();
    this.pickEvents.push(pickEvent);
    if (sendOpt.send) {
      const event: EventPickEvent = <EventPickEvent>{ 
        type: "pickEvent",
        pickEvent: pickEvent,
      };
      this.sendEvent(event, sendOpt);
    }
    this.sortPickEvents();

    // check if the winner is determined (someone picked the current characterId)
    let winnerFound = false;
    let winningCardInfo: CardInfo | null = null;
    let winningPickEvent: PickEvent | null = null;
    for (const event of this.pickEvents) {
      if (event.characterId() === currentCharacterId) {
        this.turnWinner = event.player;
        winningCardInfo = event.cardInfo;
        winnerFound = true;
        winningPickEvent = event;
        break;
      }
    }

    if (winnerFound) {

      this.state = GameJudgeState.TurnWinnerDetermined;
      {
        const alreadyInCollected = this.isInCollected(this.turnWinner, winningCardInfo!);
        if (!alreadyInCollected) {
          this.players[this.turnWinner!].collected.push(winningCardInfo!);
        }
      }

      let correctCardOnSide: Player | null = null;
      // collect card to collected
      let deckPosition = null;
      for (const deckPlayer of [0, 1]) {
        for (let i = 0; i < this.players[deckPlayer].deck.length; i++) {
          const cardInfo = this.players[deckPlayer].deck[i];
          if (cardInfo.characterId === currentCharacterId) {
            deckPosition = {deckIndex: deckPlayer as 0 | 1, cardIndex: i};
            correctCardOnSide = deckPlayer as Player;
            break;
          }
        }
        if (deckPosition !== null) {
          break;
        }
      }

      // if on the other side's collected, remove it
      if (this.matchType !== MatchType.None) {
        for (let opponent = 0; opponent < this.players.length; opponent++) {
          if (winningPickEvent!.player === opponent) { continue; }
          let indexToRemove = -1;
          for (let i = 0; i < this.players[opponent].collected.length; i++) {
            if (this.players[opponent].collected[i].characterId === currentCharacterId) {
              indexToRemove = i;
              break;
            }
          }
          if (indexToRemove !== -1) {
            console.log(`[GameJudge.notifyPickEvent] Removing card ${currentCharacterId} from ${opponent}'s collected cards.`);
            this.players[opponent].collected.splice(indexToRemove, 1);
          }
        }
      }

      if (deckPosition !== null) {
        if (winningPickEvent!.deckPosition.deckIndex !== correctCardOnSide) {
          console.warn(`[GameJudge.notifyPickEvent] Winning pick event deck index (${winningPickEvent?.deckPosition.deckIndex}) does not match correct card side (${correctCardOnSide})`);
        }
        // remove from deck
        this.removeFromDeck(
          correctCardOnSide!, deckPosition.cardIndex, 
          DontSend
        );
      }

      this.calculateGivesFromPickEvents(winningPickEvent!.deckPosition.deckIndex);

      // send sync winner determined
      if (sendOpt.send) {
        const syncData = this.buildSyncData();
        const event: EventSyncWinnerDetermined = {
          type: "syncWinnerDetermined",
          data: syncData,
        };
        this.sendEvent(event, sendOpt);
      }

      this.g().notifyTurnWinnerDetermined(this.turnWinner);
    }
    return true;
  }

  moveCard(player: Player, fromIndex: number, toPlayer: Player, toIndex: number | null, sendOpt: SendOption): boolean {
    const cardInfo = this.getDeck(player, fromIndex);
    if (cardInfo === null) {
      console.warn(`[GameJudge.moveCard] [P${player}] No card to move at index: ${fromIndex}`);
      return false;
    }
    const removed = this.removeFromDeck(player, fromIndex, sendOpt);
    if (!removed) {
      console.warn(`[GameJudge.moveCard] [P${player}] Failed to remove card from deck: ${cardInfo.characterId}, ${fromIndex}`);
      return false;
    }
    const added = this.addToDeck(toPlayer, cardInfo, toIndex, sendOpt);
    if (!added) {
      console.warn(`[GameJudge.moveCard] [P${player}] Failed to add card to deck: ${cardInfo.characterId}, ${fromIndex}`);
      return false;
    }
    return true;
  }

  isDeckFull(player: Player): boolean {
    return this.getDeckEmptyCount(player) === 0;
  }

  isDeckEmpty(player: Player): boolean {
    return this.getDeckCardCount(player) === 0;
  }

  setNextTurnTimeout(): void {
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
    }
    this.state = GameJudgeState.TurnCountdownNext;
    // after 3 seconds, call nextTurn
    this.countdownTimeout = setTimeout(() => {
      this.nextTurn();
      // Deferred publish, the one legitimate refresh inside the rules: no caller is on the
      // stack, so there is nobody else to publish this change.
      this.g().refresh();
    }, 3000);
  }

  countdownNextTurn(forceCountDown: boolean = false): void {
    // only use timeout if there is a remote player
    const needTimeout = [MatchType.Server, MatchType.Client, MatchType.Observer].includes(this.matchType);
    if (needTimeout || forceCountDown) {
      this.setNextTurnTimeout();
      this.state = GameJudgeState.TurnCountdownNext;
    } else {
      this.nextTurn();
    }
  }

  _serverNextTurn(): void {
    const ok = this.finishTurn();
    if (!ok) { return; }
    this.countdownNextTurn();
    this.g().notifyNextTurnCountdown();
  }

  _clientNextTurn(): void {
    // clear all next confirmations
    for (const player of this.players) {
      player.confirmation.next = false;
    }

    if ([MatchType.None, MatchType.CPU, MatchType.Server].includes(this.matchType)) {

      if (this.matchType === MatchType.Server) {
        // send
        const syncData = this.buildSyncData();
        const prngseed = Math.floor(Math.random() * 2147483647);
        const event = <EventSyncNextTurn>{
          type: "syncNextTurn",
          data: syncData,
          rngSeed: prngseed,
        };
        this.sendEvent(event, {send: true, except: null});
        this.g().setNextSongPRNGSeed(prngseed);
      }
      this._serverNextTurn(); 

    } else {

      this.clientWaitAcknowledge = true;

    }
  }

  giveCardsRandomly(sendOpt: SendOption): void {
    if (this.givesLeft != 0) {
      // process gives arbitrarily for CPU
      let givesLeft = this.givesLeft;
      const giver: Player = givesLeft > 0 ? 0 : 1;
      const receiver: Player = givesLeft > 0 ? 1 : 0;
      givesLeft = Math.abs(givesLeft);
      while (givesLeft > 0) {
        const fromIndices: number[] = [];
        this.players[giver].deck.forEach((cardInfo, index) => {
          if (cardInfo.characterId !== null) {
            fromIndices.push(index);
          }
        });
        const toIndices: number[] = [];
        this.players[receiver].deck.forEach((cardInfo, index) => {
          if (cardInfo.characterId === null) {
            toIndices.push(index);
          }
        });
        if (fromIndices.length === 0 || toIndices.length === 0) {
          break;
        }
        const fromIndex = fromIndices[Math.floor(Math.random() * fromIndices.length)];
        const toIndex = toIndices[Math.floor(Math.random() * toIndices.length)];
        this.moveCard(giver, fromIndex, receiver, toIndex, sendOpt);
        givesLeft -= 1;
        if (sendOpt.send &&
          ((this.givesLeft > 0 && this.matchType === MatchType.Server) || (this.givesLeft < 0 && this.matchType === MatchType.Client))
        ) {
          this.sendEvent({ type: "give" }, sendOpt);
        }
      }
      this.givesLeft = 0;
    }
  }

  finishTurn(): boolean {
    if (this.state === GameJudgeState.TurnWinnerDetermined) {
      if (this.matchType === MatchType.CPU && this.givesLeft != 0) {
        this.giveCardsRandomly(DontSend);
      }
      return true;
    }
    if (this.state === GameJudgeState.TurnStart) {
      // no winner this turn
      // check if the correct answer is in the deck. if so, remove it.
      const currentCharacterId = this.currentCharacterId();
      let correctCardOnSide: Player | null = null;
      for (const player of [0, 1]) {
        if (player >= this.players.length) { continue; }
        for (let i = 0; i < this.players[player].deck.length; i++) {
          const cardInfo = this.players[player].deck[i];
          if (cardInfo.characterId === currentCharacterId) {
            // remove from deck
            this.removeFromDeck(player as Player, i, DontSend);
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

  checkAllNextConfirmed(): boolean {
    if (this.matchType === MatchType.None || this.matchType === MatchType.CPU) {
      return this.players[0].confirmation.next;
    }
    for (const player of this.players) {
      if (player.isObserver) { continue; }
      if (!player.confirmation.next) {
        return false;
      }
    }
    return true;
  }

  checkAnyNextConfirmed(): boolean {
    for (const player of this.players) {
      if (player.isObserver) { continue; }
      if (player.confirmation.next) {
        return true;
      }
    }
    return false;
  }
  
  confirmNext(player: Player): {judgeChanged: boolean, nextTurn: boolean} {
    // if already confirmed
    if (this.players[player].confirmation.next) {
      return {judgeChanged: false, nextTurn: false};
    }

    this.players[player].confirmation.next = true;
    const event = <EventConfirmNext>{ type: "confirmNext", playerIndex: player };
    this.sendEvent(event, {send: true, except: null});

    if (this.checkAllNextConfirmed()) {
      this._clientNextTurn();
      return {judgeChanged: true, nextTurn: true};
    }

    return {judgeChanged: true, nextTurn: false};
  }

  buildSyncData(
    overwritePlayingOrder: Array<CharacterId> | null = null
  ): SyncData {
    const cardStates: Array<{deck: Array<CardInfo>, collected: Array<CardInfo>}> = [];
    for (const player of this.players) {
      cardStates.push({
        deck: player.deck,
        collected: player.collected,
      });
    }
    const baseData: SyncData = {
      deckRows: this.deckRows,
      deckColumns: this.deckColumns,
      turnWinner: this.turnWinner,
      order: new Array<{ 
        characterId: CharacterId;
        musicSelection: number;
        temporaryDisabled: boolean;
      }>(),
      pickEvents: this.pickEvents,
      cardStates: cardStates,
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
    this.sendEvent({ type: "stopGame" }, { send: true, except: null });
  }

  isMelee(): boolean {
    // more than two active players
    let activePlayerCount = 0;
    for (const player of this.players) {
      if (!player.isObserver) {
        activePlayerCount += 1;
      }
    }
    return activePlayerCount > 2;
  }

  resetGameState() {
    this.state = GameJudgeState.SelectingCards;
    this.turnWinner = null;
    if (this.countdownTimeout !== null) {
      clearTimeout(this.countdownTimeout);
    }
    this.countdownTimeout = null;
    this.turnStartTimestamp = null;
    this.pickEvents = [];
    this.givesLeft = 0;
    this.clientWaitAcknowledge = false;
    const isMelee = this.isMelee();
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      // reset all confirmations
      player.confirmation.start = false;
      player.confirmation.next = false;
      // clear collected
      player.collected = [];
      const hasDeck = (i == 0) || (i == 1 && !isMelee);
      player.deck = [];
      if (hasDeck) {
        for (let j = 0; j < this.deckRows * this.deckColumns; j++) {
          player.deck.push(new CardInfo(null, 0));
        }
      }
    }
  }

  /**
   * How many cards are currently face-up on the playground: every non-empty slot of every deck.
   * The CPU reads this to scale its reaction time and mistake rate, so a crowded board is harder
   * for it than a nearly cleared one.
   */
  playgroundCardCount(): number {
    let count = 0;
    for (const player of this.players) {
      for (const cardInfo of player.deck) {
        if (cardInfo.characterId !== null) {
          count += 1;
        }
      }
    }
    return count;
  }

  simulateCPUOpponentPick(mistake: boolean): void {
    if (this.matchType !== MatchType.CPU) {
      return;
    }
    if (this.state !== GameJudgeState.TurnStart) {
      return;
    }
    const currentCharacterId = this.currentCharacterId();
    if (!mistake) {
      // pick the correct card from any deck
      for (const player of [0, 1]) {
        for (const [index, cardInfo] of this.players[player].deck.entries()) {
          if (cardInfo.characterId === currentCharacterId) {
            this.notifyPickEvent(new PickEvent(
              Date.now() - this.turnStartedAt(),
              1,
              cardInfo,
              {deckIndex: player as 0 | 1, cardIndex: index}
            ), DontSend);
            return;
          }
        }
      }
    } else {
      // pick a wrong card from any deck
      const selectableCardInfos: Array<[CardInfo, DeckPosition]> = [];
      for (const player of [0, 1]) {
        for (const [index, cardInfo] of this.players[player].deck.entries()) {
          if (cardInfo.characterId !== null && cardInfo.characterId !== currentCharacterId) {
            selectableCardInfos.push([cardInfo, {deckIndex: player as 0 | 1, cardIndex: index}]);
          }
        }
      }
      if (selectableCardInfos.length > 0) {
        const randomIndex = Math.floor(Math.random() * selectableCardInfos.length);
        const [cardInfo, deckPosition] = selectableCardInfos[randomIndex];
        this.notifyPickEvent(new PickEvent(
          Date.now() - this.turnStartedAt(),
          1,
          cardInfo,
          deckPosition
        ), DontSend);
      }
    }
  }

  /**
   * Whether every character in the playing order is either held in a deck/collected pile or
   * disabled in temporary, i.e. whether `filterMusicByDeck` has nothing left to do.
   *
   * The two state-derived inputs are arguments rather than reads of `outerRef`: the ref mirrors
   * React state one commit behind, so a render (which is where the filter button asks this
   * question) would otherwise answer with the values from before the click it is rendering.
   */
  isMusicFilteredByDeck(
    characterTemporaryDisabled: Map<CharacterId, boolean>,
    playingOrder: Array<CharacterId>,
  ): boolean {
    // check all cards that are not inside deck are disabled in temporary
    const inDeck = new Set<CharacterId>();
    for (const player of this.players) {
      for (const cardInfo of player.deck) {
        if (cardInfo.characterId !== null) {
          inDeck.add(cardInfo.characterId);
        }
      }
      for (const cardInfo of player.collected) {
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
    for (const player of [0, 1]) {
      if (player >= this.players.length) { continue; }
      for (const cardInfo of this.players[player].deck) {
        if (cardInfo.characterId !== null) {
          inDeck.add(cardInfo.characterId);
        }
      }
      for (const cardInfo of this.players[player].collected) {
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

  broadcastNames(): void {
    const settings = this.players.map((player) => {return {name: player.name, isObserver: player.isObserver};});
    const syncData = this.buildSyncData();
    
    for (let i = 1; i < this.players.length; i++) {
      this.sendServerEventTo({
        type: "broadcastPlayerNames",
        settings: settings,
        syncData: syncData,
        yourIndex: i,
        state: this.state,
      }, i);
    }
  }

  removePlayer(id: number): void {
    if (id < 0 || id >= this.players.length) {
      console.warn(`[GameJudge.removePlayer] Invalid player id: ${id}`);
      return;
    }
    this.players.splice(id, 1);
    // The caller is responsible for publishing the change (and for rebroadcasting names).
  }

  addPlayer(name: string = "New Observer", fillDeck: boolean = false): void {
    // add a observer player
    this.players.push({
      name: name,
      isObserver: true,
      deck: [],
      collected: [],
      confirmation: {
        start: false,
        next: false,
      },
    });
    if (fillDeck) {
      for (let j = 0; j < this.deckRows * this.deckColumns; j++) {
        this.players[this.players.length - 1].deck.push(new CardInfo(null, 0));
      }
    }
    // No refresh here: publishing a copy in the middle of a mutation sequence would freeze the
    // caller's remaining changes in a stale instance. The caller marks the judge as changed.
  }

  addCPUPlayer(): void {
    if (this.matchType !== MatchType.CPU) {
      console.warn(`[GameJudge.addCPUPlayer] Cannot add CPU player in match type: ${this.matchType}`);
      return;
    }
    if (this.players.length !== 1) {
      console.warn(`[GameJudge.addCPUPlayer] Cannot add CPU player when there are already multiple players.`);
      return;
    }
    // add a cpu player
    this.players.push({
      name: `CPU Opponent`,
      isObserver: false,
      deck: [],
      collected: [],
      confirmation: {
        start: false,
        next: false,
      },
    });
    for (let j = 0; j < this.deckRows * this.deckColumns; j++) {
      this.players[1].deck.push(new CardInfo(null, 0));
    }
  }

  sendSyncData(toPlayer: number | null = null): void {
    const syncData = this.buildSyncData();
    const event: EventSyncData = {
      type: "syncData",
      data: syncData,
    };
    if (toPlayer === null) {
      this.sendEvent(event, { send: true, except: null });
    } else {
      this.sendServerEventTo(event, toPlayer);
    }
  }

  resetNonServerState() {
    this.state = GameJudgeState.SelectingCards;
    const clientCount = this.players.filter(p => !p.isObserver).length - 1;
    for (let i = 1; i < this.players.length; i++) {
      this.players[i].deck = [];
    }
    if (clientCount === 1) {
      this.players[1].deck = [];
      for (let j = 0; j < this.deckRows * this.deckColumns; j++) {
        this.players[1].deck.push(new CardInfo(null, 0));
      }
    }
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].collected = [];
      this.players[i].confirmation.next = false;
      this.players[i].confirmation.start = false;
    }
  }

  // this function is used to be passed to the GamePeer object.
  //
  // Publishing contract: this method never refreshes. It is called synchronously from the
  // session layer, which publishes once afterwards. Refresh calls scattered through the switch
  // used to publish half-updated states mid-handler; see `refresh` in OuterRefObject.
  remoteEventListener(sender: number, event: Event): void {

    const sendExcept = this.matchType === MatchType.Server ? <SendOption>{ send: true, except: sender } : DontSend;

    const applySyncData = (data: SyncData) => {
      this.deckRows = data.deckRows;
      this.deckColumns = data.deckColumns;
      this.turnWinner = data.turnWinner;
      this.pickEvents = [];
      for (const event of data.pickEvents) {
        this.pickEvents.push(new PickEvent(
          event.timestamp,
          event.player,
          new CardInfo(event.cardInfo.characterId, event.cardInfo.cardIndex),
          event.deckPosition
        ));
      }
      // set deck and collected
      for (let i = 0; i < this.players.length; i++) {
        const player = this.players[i];
        const cardState = data.cardStates[i];
        player.deck = []
        for (const cardInfo of cardState.deck) {
          player.deck.push(new CardInfo(cardInfo.characterId, cardInfo.cardIndex));
        }
        player.collected = []
        for (const cardInfo of cardState.collected) {
          player.collected.push(new CardInfo(cardInfo.characterId, cardInfo.cardIndex));
        }
      }
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

    const syncOrRequestSync = () => {
      if (this.isServer()) {
        // if server, send self data to client
        const syncData = this.buildSyncData();
        this.sendServerEventTo({
          type: "syncData",
          data: syncData,
        }, sender);
      } else {
        // request server to send sync data
        this.sendEvent({
          type: "requestSyncData",
        }, SendToAll);
      }
    }

    console.log(sender, "=>", event);

    switch (event.type) {

      case "addCard": {

        const e = event as EventAddCard;
        e.cardInfo = new CardInfo(e.cardInfo.characterId, e.cardInfo.cardIndex);
        const successful = this.addToDeck(e.deckPosition.deckIndex, e.cardInfo, e.deckPosition.cardIndex, sendExcept);

        if (!successful) { syncOrRequestSync(); }

        break;

      }

      case "clearDeck": {
        const e = event as EventClearDeck;
        this.clearDeck(e.player, sendExcept);
        break;
      }

      case "removeCard": {

        const e = event as EventRemoveCard;
        const successful = this.removeFromDeck(e.deckPosition.deckIndex, e.deckPosition.cardIndex, sendExcept);

        if (!successful) { syncOrRequestSync(); }

        break;

      }

      case "adjustDeckSize": {
        const e = event as EventAdjustDeckSize;
        this.adjustDeckSize(e.rows, e.columns, sendExcept);
        break;
      }

      case "confirmStart": {

        this.players[event.playerIndex].confirmation.start = true;

        if (this.matchType === MatchType.Server) {
          // broadcast
          this.sendEvent(event, sendExcept);
        }

        if (this.checkAllStartConfirmed()) {
          this._clientStartGame();
        }

        break;
      }
      case "confirmNext": {

        this.players[event.playerIndex].confirmation.next = true;

        if (this.matchType === MatchType.Server) {
          // broadcast
          this.sendEvent(event, sendExcept);
        }
        
        if (this.checkAllNextConfirmed()) {
          this._clientNextTurn();
        }

        break;
      }

      case "pickEvent": {
        const e = event as EventPickEvent;
        e.pickEvent.cardInfo = new CardInfo(e.pickEvent.cardInfo.characterId, e.pickEvent.cardInfo.cardIndex);
        this.notifyPickEvent(new PickEvent(
          e.pickEvent.timestamp,
          e.pickEvent.player,
          e.pickEvent.cardInfo,
          {
            deckIndex: e.pickEvent.deckPosition.deckIndex,
            cardIndex: e.pickEvent.deckPosition.cardIndex,
          }
        ), sendExcept);
        break;
      }

      case "stopGame": {
        this.g().notifyStopGame();
        if (this.isServer()) {
          // broadcast
          this.sendEvent(event, sendExcept);
        }
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
        const data = e.data;
        // apply the sync data
        applySyncData(data);
        if (event.type === "syncStart") {
          const newOrder = data.order.map(item => item.characterId);
          this._serverStartGame(newOrder);
        } else if (event.type === "syncNextTurn") {
          this._serverNextTurn();
        }
        break;
      }

      case "switchTraditionalMode": {
        const e = event as EventSwitchTraditionalMode;
        this.traditionalMode = e.traditionalMode;
        if (this.isServer()) {
          // broadcast
          this.sendEvent(event, sendExcept);
        }
        break;
      }

      case "give": {
        if (this.isServer() && this.givesLeft < 0) {
          this.givesLeft += 1;
          this.sendEvent(event, sendExcept);
        } else {
          // this is an event sent from the sender
          if (this.givesLeft < 0) { 
            this.givesLeft += 1; // an event broadcast-forwarded from the server; 
          }
          if (this.givesLeft > 0) { 
            this.givesLeft -= 1; // an event directly sent by the server
          }
        }
        break;
      }

      case "syncSettings": {
        // this must be received by a client/observer
        const e = event as EventSyncSettings;
        this.traditionalMode = e.traditionalMode;
        this.deckRows = e.deckRows;
        this.deckColumns = e.deckColumns;
        this.resetGameState();
        this.sendEventToServer({
          type: "notifyName",
          name: this.players[this.myPlayerIndex].name,
          isObserver: this.matchType === MatchType.Observer,
        });
        break;
      }

      case "filterMusicByDeck": {
        this.filterMusicByDeck();
        if (this.isServer()) {
          // broadcast
          this.sendEvent(event, sendExcept);
        }
        break;
      }

      case "notifyName": {
        if (!this.isServer()) {
          console.warn("[GameJudge.remoteEventListener] Only server can receive notifyName event.");
        }
        const e = event as EventNotifyName;
        this.players[sender].name = e.name;
        this.players[sender].isObserver = e.isObserver;
        // reset all confirmations
        for (const player of this.players) {
          player.confirmation.start = false;
          player.confirmation.next = false;
        }
        break;
      }

      case "broadcastPlayerNames": {
        if (this.isServer()) {
          console.warn("[GameJudge.remoteEventListener] Server should not receive broadcastPlayerNames event.");
        } else {
          const e = event as EventBroadcastPlayerNames;
          const nonObserverCount = e.settings.filter(s => !s.isObserver).length;
          const oneOnOne = nonObserverCount <= 2;
          if (e.settings.length > this.players.length) {
            for (let i = this.players.length; i < e.settings.length; i++) {
              const canHaveDeck = (i == 0) || (i == 1 && oneOnOne);
              const deck = [];
              if (canHaveDeck) {
                for (let j = 0; j < this.deckRows * this.deckColumns; j++) {
                  deck.push(new CardInfo(null, 0));
                }
              }
              this.players.push({
                name: e.settings[i].name,
                isObserver: e.settings[i].isObserver,
                deck: deck,
                collected: [],
                confirmation: {
                  start: false,
                  next: false,
                },
              });
            }
          } else if (e.settings.length < this.players.length) {
            while (e.settings.length < this.players.length) {
              this.players.pop();
            }
          }
          for (let i = 0; i < e.settings.length && i < this.players.length; i++) {
            this.players[i].name = e.settings[i].name;
            this.players[i].isObserver = e.settings[i].isObserver;
          }
          // this.resetNonServerState();
          applySyncData(e.syncData);
          if (this.state !== GameJudgeState.SelectingCards && e.state === GameJudgeState.SelectingCards) {
            this.g().notifyStopGame();
          }
          this.state = e.state;
          this.myPlayerIndex = e.yourIndex;
          // reset all confirmations
          for (const player of this.players) {
            player.confirmation.start = false;
            player.confirmation.next = false;
          }
        }
        break;
      }

      case "requestSyncData": {
        if (this.isServer()) {
          this.sendSyncData(sender);
        } else {
          console.warn("[GameJudge.remoteEventListener] Only server can receive requestSyncData event.");
        }
        break;
      }

    }
    this.outerRef.current?.notifyOuterEventHandler(sender, event);
  }

}

// Re-exported so existing imports from "./GameJudge" keep working.
export {
  GameJudge,
  GameJudgeState,
  CardInfo,
  PickEvent,
  MatchType,
  GamePeer,
  ClientConnection,
  DontSend,
  SendToAll,
};
export type {
  OuterRefObject,
  Player,
  DeckPosition,
  PlayerInfo,
  SendOption,
};
export type {
  Event, EventAddCard, EventRemoveCard,
  EventAdjustDeckSize, EventConfirmStart,
  EventConfirmNext, EventPickEvent,
  EventSyncWinnerDetermined, EventSyncStart,
  EventSyncNextTurn, EventStopGame,
  EventSwitchTraditionalMode,
  EventGive, EventChat, SyncData,
};
export { encodeEvent, decodeEvent, isKnownEventType } from "./syncCodec";
