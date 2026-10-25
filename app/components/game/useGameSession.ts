"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  CharacterId, GlobalData, MusicSelectionMap, PlaybackSetting,
} from "../../types/Configs";
import {
  CardInfo, GameJudgeState, MatchType, PickEvent, SendOption, SendToAll,
} from "../../types/GameTypes";
import { GameJudge } from "../../types/GameJudge";
import { ClientConnection, GamePeer } from "../../types/GamePeer";
import type { Event, EventBroadcastPlayerNames, EventChat, EventNotifyName, EventSyncSettings } from "../../types/GameEvents";
import type { OuterRefObject } from "../../types/GameJudge";
import { MaxDeckColumns, MaxDeckRows } from "../../lib/geometry";
import { loadPlayerName, savePlayerName } from "../../lib/persistence";
import { getFeatures } from "../../lib/features";
import { buildJoinUrl, resolveJoinLink } from "../../lib/joinLink";
import type { JoinRole } from "../../lib/joinLink";
import { useCanPlayGame } from "../../lib/useWindowWidth";
import { enableCheat, isCheatString } from "../../types/Cheat";
import { useVersion } from "../../lib/useVersion";
import { GetLocalizedString, Localization } from "../../types/Localization";
import { ChatMessage } from "../ChatBox";
import type { GameTimerDisplayHandle } from "./GameTimerDisplay";
import {
  DefaultCPUOpponentSetting, cpuMistakeRate, sampleCPUReactionTime,
} from "./cpuOpponent";
import type { CPUOpponentSetting } from "./cpuOpponent";
import {
  computeNextTurnButton, computeNextTurnInstruction, computeOpponentButton, computeStartButton,
} from "./gameButtonModels";
import type {
  NextTurnButtonModel, OpponentButtonModel, StartButtonModel,
} from "./gameButtonModels";
import { useBoardSetting } from "./useBoardSetting";
import { useUnusedCards } from "./useUnusedCards";
import { localWaitingRoster } from "./localRoster";
import type { DragInfo } from "./cardDrag";

/**
 * The game session controller: owns the judge, the peer connection, chat, the persisted
 * board settings and every action the board can trigger. The board component itself is
 * left with layout and rendering.
 */

export type GameSessionProps = {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  playingOrder: Array<CharacterId>;
  playbackSetting: PlaybackSetting;
  musicStartTimestamp: number;
  notifyGameStart: (order: Array<CharacterId> | null) => Array<CharacterId>;
  notifyGameEnd: () => void;
  notifyPauseMusic: () => void;
  notifyPlayMusic: () => void;
  notifyPlayCountdownAudio: () => void;
  setNextSongPRNGSeed: (seed: number) => void;
  setCurrentCharacterId: (characterId: CharacterId) => void;
  setPlayingOrder: (order: Array<CharacterId>) => void;
  setCharacterTemporaryDisabled: (map: Map<CharacterId, boolean>) => void;
  setMusicSelection: (map: MusicSelectionMap) => void;
  setPlaybackSetting: (setting: PlaybackSetting) => void;
};

export type GameSession = {
  /** The mutable game model. Mutated in place; `judgeVersion` changes when it did. */
  judge: GameJudge;
  /** Bumped whenever the judge is mutated. Use it in memo dependencies, never the instance. */
  judgeVersion: number;
  peer: GamePeer;
  /** Bumped whenever the peer layer wants a re-render. */
  peerVersion: number;
  sendToAll: SendOption;
  chatMessages: Array<ChatMessage>;
  addSystemChatMessage: (message: string) => void;
  sendChatMessage: (message: string) => void;
  myName: string;
  setMyName: (name: string) => void;
  peerError: string;
  remotePlayerIdInput: string;
  setRemotePlayerIdInput: (value: string) => void;
  cpuOpponentSetting: CPUOpponentSetting;
  setCpuOpponentSetting: (setting: CPUOpponentSetting) => void;
  cardWidthPercentage: number;
  unusedCards: Array<CardInfo>;
  /** The card interaction state the board renders. Reset whenever the game stops. */
  dragInfo: DragInfo | null;
  setDragInfo: (dragInfo: DragInfo | null) => void;
  hoveringCardInfo: CardInfo | null;
  setHoveringCardInfo: (cardInfo: CardInfo | null) => void;
  /** Which deck the local deck controls act on. */
  localDeckIndex: number;
  /** Whether the music is already narrowed down to the cards in play. */
  isMusicFilteredByDeck: boolean;
  /**
   * Whether the deck's Random Fill would place nothing: the deck is full or every character is
   * already on a board pile. Derived from the live selection, not the judge's mirrored ref.
   */
  randomFillDisabled: boolean;
  opponentRandomFillDisabled: boolean;
  timerRef: RefObject<GameTimerDisplayHandle | null>;
  isSelectingCards: boolean;
  isCPU: boolean;
  isMelee: boolean;
  isNoOpponent: boolean;
  isServerClientObserver: boolean;
  is1v1: boolean;
  startButton: StartButtonModel;
  opponentButton: OpponentButtonModel;
  nextTurnButton: NextTurnButtonModel;
  nextTurnInstruction: string;
  /** Marks the mutated judge instance as changed so React re-renders. */
  markJudgeChanged: () => void;
  actions: {
    cardSmaller: () => void;
    cardLarger: () => void;
    addRow: () => void;
    removeRow: () => void;
    addColumn: () => void;
    removeColumn: () => void;
    filterByDeck: () => void;
    randomFillDeck: () => void;
    clearDeck: () => void;
    shuffleDeck: () => void;
    startOrStopGame: () => void;
    nextTurn: () => void;
    toggleTraditionalMode: () => void;
    shuffleOpponentDeck: () => void;
    clearOpponentDeck: () => void;
    randomFillOpponentDeck: () => void;
    switchOpponentType: () => void;
    connectToServer: () => void;
    regeneratePeerId: () => void;
    copyPeerId: () => void;
    copyClientJoinUrl: () => void;
    copyObserverJoinUrl: () => void;
    toggleClientObserver: () => void;
    pickDeckCard: (playerIndex: 0 | 1, cardIndex: number, cardInfo: CardInfo) => void;
    playMusic: () => void;
    pauseMusic: () => void;
  };
};

export function useGameSession(props: GameSessionProps): GameSession {
  const {
    data, musicSelection, currentCharacterId, characterTemporaryDisabled, playingOrder,
    playbackSetting, musicStartTimestamp, notifyGameStart, notifyGameEnd,
    notifyPauseMusic, notifyPlayMusic, notifyPlayCountdownAudio, setNextSongPRNGSeed,
    setCurrentCharacterId, setPlayingOrder, setCharacterTemporaryDisabled, setPlaybackSetting,
  } = props;

  // region state

  // `judgeVersion`/`peerVersion` are the only "changed" signals for the two mutable models
  // (see lib/useVersion).
  const [judgeVersion, bumpJudgeVersion] = useVersion();
  const [peerVersion, bumpPeerVersion] = useVersion();
  const markJudgeChanged = useCallback(() => { bumpJudgeVersion(); }, [bumpJudgeVersion]);

  const peerRef = useRef<GamePeer>(new GamePeer());
  const peer = peerRef.current;

  const outerRef = useRef<OuterRefObject>({
    globalData: data,
    playingOrder: playingOrder,
    characterTemporaryDisabled: characterTemporaryDisabled,
    currentCharacterId: currentCharacterId,
    musicSelection: musicSelection,
    playbackSetting: playbackSetting,
    musicStartTimestamp: musicStartTimestamp,
    setCurrentCharacterId: setCurrentCharacterId,
    setPlayingOrder: setPlayingOrder,
    setCharacterTemporaryDisabled: setCharacterTemporaryDisabled,
    setMusicSelection: props.setMusicSelection,
    setPlaybackSetting: setPlaybackSetting,
    setNextSongPRNGSeed: setNextSongPRNGSeed,
    notifyTurnWinnerDetermined: (_unused) => {},
    notifyTurnStarted: (_characterId) => {},
    peer: peer,
    notifyStartGame: () => new Array<CharacterId>(),
    notifyNextTurnCountdown: () => {},
    notifyStopGame: () => {},
    notifyOuterEventHandler: (_sender, _event: Event) => {},
    refresh: () => { bumpJudgeVersion(); },
  });

  // The judge is a mutable model, not an immutable value: every mutation is visible to
  // everyone holding it. React only needs a nudge to re-render, so the instance is created
  // once and `judgeVersion` is bumped whenever it changed. Publishing copies instead used to
  // let the rules engine and the event handlers mutate two different instances, silently
  // dropping half of every update.
  const [judge] = useState<GameJudge>(() => new GameJudge(outerRef));
  // The local player's name is the judge's player slot; there is no second copy of it.
  const myName = judge.players[judge.myPlayerIndex]?.name ?? "";
  const [remotePlayerIdInput, setRemotePlayerIdInput] = useState<string>("");
  const [peerError, setPeerError] = useState<string>("");
  const [cpuOpponentSetting, setCpuOpponentSetting] = useState<CPUOpponentSetting>({
    ...DefaultCPUOpponentSetting,
  });
  // A handle, not state: it is never rendered.
  const cpuOpponentClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<ChatMessage>>([]);
  const timerRef = useRef<GameTimerDisplayHandle>(null);
  // The board's drag interaction. Owned here rather than in the board component because the
  // unused-cards rule and the game-stopping handlers both need it.
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [hoveringCardInfo, setHoveringCardInfo] = useState<CardInfo | null>(null);

  /** Drops any half-finished drag so a board reset cannot leave a card stuck under the cursor. */
  const clearBoardInteraction = useCallback(() => {
    setDragInfo(null);
    setHoveringCardInfo(null);
  }, []);

  const boardSetting = useBoardSetting(judge, markJudgeChanged);
  const unusedCards = useUnusedCards({
    data, musicSelection, playingOrder, judge, judgeVersion,
    draggedCard: dragInfo?.cardInfo ?? null,
  });

  const addSystemChatMessage = useCallback((message: string) => {
    setChatMessages((messages) => [...messages, {
      role: "system",
      sender: GetLocalizedString(Localization.ChatMessageSenderSystem),
      message: message,
    }]);
  }, []);

  /**
   * The "who is in this room" line. Shared, so the server (which owns the roster) and the
   * client (which reads it off the broadcast event) word it identically.
   */
  const buildParticipantsMessage = useCallback(
    (settings: Array<{ name: string; isObserver: boolean }>): string => {
      let message = "";
      settings.forEach((setting, index) => {
        message += `${index === 0 ? "" : ", "}${setting.name}`;
        if (index === 0) {
          message += ` (${GetLocalizedString(Localization.GameParticipantsServer)})`;
        } else if (index === judge.myPlayerIndex) {
          message += ` (${GetLocalizedString(Localization.GameParticipantsYou)})`;
          if (setting.isObserver) {
            message += ` (${GetLocalizedString(Localization.GameObserver)})`;
          }
        } else if (setting.isObserver) {
          message += ` (${GetLocalizedString(Localization.GameObserver)})`;
        } else {
          message += ` (${GetLocalizedString(Localization.GamePlayer)})`;
        }
      });
      return GetLocalizedString(Localization.GameMessageParticipants) + ": " + message;
    },
    [judge],
  );

  /** Announces the current roster from the server's own player list. */
  const addParticipantsMessage = useCallback(() => {
    addSystemChatMessage(buildParticipantsMessage(
      judge.players.map((player) => ({ name: player.name, isObserver: player.isObserver })),
    ));
  }, [judge, buildParticipantsMessage, addSystemChatMessage]);

  const applyMyName = useCallback((name: string) => {
    savePlayerName(name);
    // The local player is the one at myPlayerIndex; for a client that has not connected yet it
    // is the slot reserved for it. Renaming anything else would display one name and send
    // another one (the client announces players[myPlayerIndex].name to the server).
    const index = judge.myPlayerIndex;
    if (index >= 0 && judge.players.length > index) {
      judge.players[index].name = name;
    }
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  // region derived role flags

  const isMelee = judge.isMelee();
  const isCPU = judge.matchType === MatchType.CPU;
  const isServerClientObserver = judge.isServerClientObserverMode();
  const isNoOpponent = judge.matchType === MatchType.None;
  const is1v1 = isCPU || (isServerClientObserver && !isMelee);
  const isSelectingCards = judge.state === GameJudgeState.SelectingCards;

  // Asked here, from the live state, rather than from `judge.isMusicFilteredByDeck()` at the call
  // site: the outer ref only catches up with `characterTemporaryDisabled` after the commit, so a
  // render that read it there would show the filter button one click behind.
  const isMusicFilteredByDeck = judge.isMusicFilteredByDeck(characterTemporaryDisabled, playingOrder);

  // region peer callbacks

  const disconnectWebRTCIfAny = useCallback(() => { peer.disconnect(); }, [peer]);

  const resetOpponentDeck = useCallback(() => {
    if (judge.matchType === MatchType.Client || judge.matchType === MatchType.Observer) {
      const waiting = localWaitingRoster({
        players: judge.players,
        myPlayerIndex: judge.myPlayerIndex,
        fillLocalDeck: judge.matchType === MatchType.Client,
        deckSize: judge.deckRows * judge.deckColumns,
      });
      judge.players = waiting.players;
      judge.myPlayerIndex = waiting.myPlayerIndex;
      judge.resetNonServerState();
    } else {
      // Capture the local name before the player array is rebuilt around slot 0.
      const selfName = judge.players[judge.myPlayerIndex]?.name ?? "";
      judge.players = [judge.players[0]];
      judge.players[0].name = selfName;
      judge.myPlayerIndex = 0;
      if (judge.matchType === MatchType.CPU) {
        judge.addCPUPlayer();
      }
    }
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const handleClientDisconnected = useCallback((id: number) => {
    if (id >= judge.players.length) {
      console.warn(`[GameTab] Client disconnected with id ${id}, but no such player exists.`);
      return;
    }
    const isObserver = judge.players[id].isObserver;

    if (!isObserver) {
      judge.state = GameJudgeState.SelectingCards;
      judge.stopGame();
      clearBoardInteraction();
      notifyGameEnd();
    }

    const message = GetLocalizedString(Localization.ChatMessageClientDisconnected, new Map<string, string>([
      ["clientName", judge.players[id].name],
    ]));
    addSystemChatMessage(message);
    judge.sendEvent({ type: "chat", sender: "system", message: message }, SendToAll);

    judge.removePlayer(id);

    // re-index the remaining connections so client ids stay contiguous
    const remaining: Array<ClientConnection> = [];
    for (const connection of peer.dataConnectionToClients) {
      if (connection.index < id) {
        remaining.push(connection);
      } else if (connection.index > id) {
        connection.index -= 1;
        remaining.push(connection);
      }
    }
    peer.dataConnectionToClients = remaining;

    if (!isObserver) {
      judge.resetNonServerState();
    }
    judge.broadcastNames();
    markJudgeChanged();
  }, [judge, peer, markJudgeChanged, addSystemChatMessage, notifyGameEnd, clearBoardInteraction]);

  const handleDisconnectedFromServer = useCallback(() => {
    judge.state = GameJudgeState.SelectingCards;
    judge.stopGame();
    clearBoardInteraction();
    notifyGameEnd();
    addSystemChatMessage(GetLocalizedString(Localization.ChatMessageServerDisconnected));
    if (judge.isClient() || judge.isObserver()) {
      // Rebuild around the local seat: the old slot 1 may belong to another client, and taking
      // its name would make the local player announce a departed player's name on reconnect.
      resetOpponentDeck();
    } else {
      judge.players = [judge.players[0]];
      judge.myPlayerIndex = 0;
      judge.resetNonServerState();
    }
    markJudgeChanged();
  }, [
    judge, resetOpponentDeck, markJudgeChanged, notifyGameEnd, addSystemChatMessage,
    clearBoardInteraction,
  ]);

  const handleClientConnected = useCallback((id: number) => {
    if (judge.players.length > id) {
      console.warn(`[GameTab] Client connected with id ${id}, but player already exists.`);
      return;
    }
    judge.addPlayer();
    peer.sendEventToClient({
      type: "syncSettings",
      traditionalMode: judge.traditionalMode,
      randomStartPosition: playbackSetting.randomStartPosition,
      playbackDuration: playbackSetting.playbackDuration,
      deckColumns: judge.deckColumns,
      deckRows: judge.deckRows,
    } as EventSyncSettings, id);
    markJudgeChanged();
  }, [judge, peer, playbackSetting, markJudgeChanged]);

  const handleConnectedToServer = useCallback(() => {
    if (judge.players.length <= 1) {
      judge.addPlayer();
    }
    judge.players = [judge.players[0], judge.players[1]];
    addSystemChatMessage(GetLocalizedString(Localization.ChatMessageConnectedToServer));
    markJudgeChanged();
  }, [judge, markJudgeChanged, addSystemChatMessage]);

  const handlePeerError = useCallback((error: string) => { setPeerError(error); }, []);

  // region outer events

  const outerEventHandler = useCallback((sender: number, event: Event) => {
    const sendExcept: SendOption = { send: true, except: sender };

    switch (event.type) {
      case "pauseMusic": {
        notifyPauseMusic();
        if (judge.isServer()) {
          judge.sendEvent(event, sendExcept);
        }
        break;
      }

      case "resumeMusic": {
        notifyPlayMusic();
        if (judge.isServer()) {
          judge.sendEvent(event, sendExcept);
        }
        break;
      }

      case "syncSettings": {
        if (judge.isServer()) {
          console.warn("[GameTab] Received syncSettings event on server.");
        } else {
          setPlaybackSetting({
            ...playbackSetting,
            randomStartPosition: event.randomStartPosition,
            playbackDuration: event.playbackDuration,
          });
        }
        break;
      }

      case "chat": {
        const chatEvent = event as EventChat;
        setChatMessages((messages) => [...messages, {
          role: chatEvent.sender === "system"
            ? "system"
            : (judge.players[chatEvent.sender as number].isObserver ? "observer" : "peer"),
          sender: chatEvent.sender === "system"
            ? GetLocalizedString(Localization.ChatMessageSenderSystem)
            : judge.players[chatEvent.sender as number].name,
          message: chatEvent.message,
        }]);
        if (judge.isServer()) {
          judge.sendEvent(event, sendExcept);
        }
        break;
      }

      case "broadcastPlayerNames": {
        const settingEvent = event as EventBroadcastPlayerNames;
        addSystemChatMessage(buildParticipantsMessage(settingEvent.settings));
        break;
      }

      case "notifyName": {
        const nameEvent = event as EventNotifyName;
        if (nameEvent.isObserver) {
          judge.broadcastNames();
          addSystemChatMessage(GetLocalizedString(
            Localization.ChatMessageConnectedFromObserver,
            new Map<string, string>([["clientName", nameEvent.name]]),
          ));
          addParticipantsMessage();
          break;
        }

        // keep players before observers so client ids stay stable
        const newOrder: Array<number> = [];
        for (let i = 1; i < judge.players.length; i++) {
          if (!judge.players[i].isObserver) { newOrder.push(i); }
        }
        for (let i = 1; i < judge.players.length; i++) {
          if (judge.players[i].isObserver) { newOrder.push(i); }
        }
        let changed = false;
        for (let i = 1; i < judge.players.length; i++) {
          if (newOrder[i - 1] !== i) { changed = true; break; }
        }
        const newPlayers: Array<typeof judge.players[number]> = [];
        for (let i = 0; i < newOrder.length; i++) {
          const originalIndex = peer.dataConnectionToClients[i].index;
          let found = false;
          for (let j = 0; j < judge.players.length; j++) {
            if (originalIndex === newOrder[j]) {
              peer.dataConnectionToClients[i].index = j + 1;
              found = true;
              break;
            }
          }
          if (!found) {
            console.error("[GameTab] Failed to reorganize peer connections upon client notifyName.");
          }
          newPlayers.push(judge.players[newOrder[i]]);
        }
        if (changed) {
          judge.players = [judge.players[0], ...newPlayers];
        }

        judge.resetNonServerState();
        judge.stopGame();
        judge.state = GameJudgeState.SelectingCards;
        clearBoardInteraction();
        notifyGameEnd();

        judge.broadcastNames();
        markJudgeChanged();
        addSystemChatMessage(GetLocalizedString(
          Localization.ChatMessageConnectedFromClient,
          new Map<string, string>([["clientName", nameEvent.name]]),
        ));
        // The roster is worth announcing on both sides, not just to the client that joined.
        addParticipantsMessage();
        break;
      }
    }
  }, [
    judge, peer, playbackSetting, setPlaybackSetting, notifyPauseMusic, notifyPlayMusic,
    notifyGameEnd, addSystemChatMessage, markJudgeChanged, clearBoardInteraction,
    buildParticipantsMessage, addParticipantsMessage,
  ]);

  // region effects

  // Install the peer callbacks (and the outer-ref hooks the rules engine calls back into) in one
  // place, after commit. Assigning them during render worked only because both objects happen to
  // be stable, and it made the wiring order invisible.
  useEffect(() => {
    peer.refresh = () => { bumpPeerVersion(); };
    peer.notifyClientDisconnected = handleClientDisconnected;
    peer.notifyDisconnectedFromServer = handleDisconnectedFromServer;
    peer.notifyClientConnected = handleClientConnected;
    peer.notifyConnectedToServer = handleConnectedToServer;
    peer.notifyPeerError = (_id: number, error: string) => { handlePeerError(error); };
  }, [
    peer, bumpPeerVersion, handleClientDisconnected, handleDisconnectedFromServer,
    handleClientConnected, handleConnectedToServer, handlePeerError,
  ]);

  useEffect(() => {
    if (peerError) {
      console.error("Peer error:", peerError);
      addSystemChatMessage(
        GetLocalizedString(Localization.ChatMessagePeerConnectionError) + " - " + peerError,
      );
    }
    peer.ensurePeerNotNull();
  }, [peerError, peer, addSystemChatMessage]);

  // Events are delivered straight to the model. The listeners live in GamePeer and are attached
  // when a connection is created, so nothing is lost in the gap between a connection opening and
  // React re-rendering.
  useEffect(() => {
    peer.onEventFromClient = (clientIndex, event) => {
      judge.remoteEventListener(clientIndex, event);
      // the rules never publish; delivering an event is a synchronous call like any action
      markJudgeChanged();
    };
    peer.onEventFromServer = (event) => {
      judge.remoteEventListener(0, event);
      markJudgeChanged();
    };
  }, [peer, judge, markJudgeChanged]);

  useEffect(() => {
    outerRef.current.notifyOuterEventHandler = outerEventHandler;
  }, [outerEventHandler]);

  // drop cards whose character is no longer in the playing order
  useEffect(() => {
    const inPlayingOrder = new Set<CharacterId>(playingOrder);
    let deckChanged = false;
    judge.players.forEach((player, playerIndex) => {
      player.deck.forEach((cardInfo, cardIndex) => {
        if (cardInfo.characterId !== null && !inPlayingOrder.has(cardInfo.characterId)) {
          judge.removeFromDeck(playerIndex as 0 | 1, cardIndex, SendToAll);
          deckChanged = true;
        }
      });
    });
    if (deckChanged) {
      markJudgeChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingOrder]);

  useEffect(() => {
    outerRef.current.globalData = data;
    outerRef.current.playingOrder = playingOrder;
    outerRef.current.characterTemporaryDisabled = characterTemporaryDisabled;
    outerRef.current.currentCharacterId = currentCharacterId;
    outerRef.current.musicSelection = musicSelection;
    outerRef.current.playbackSetting = playbackSetting;
    outerRef.current.musicStartTimestamp = musicStartTimestamp;
    outerRef.current.peer = peer;
    outerRef.current.setCurrentCharacterId = setCurrentCharacterId;
    outerRef.current.setPlayingOrder = setPlayingOrder;
    outerRef.current.setCharacterTemporaryDisabled = setCharacterTemporaryDisabled;
    outerRef.current.setMusicSelection = props.setMusicSelection;
    outerRef.current.setPlaybackSetting = setPlaybackSetting;
    outerRef.current.setNextSongPRNGSeed = setNextSongPRNGSeed;
  }, [
    data, playingOrder, characterTemporaryDisabled, currentCharacterId, musicSelection,
    playbackSetting, musicStartTimestamp, peer, setCurrentCharacterId, setPlayingOrder,
    setCharacterTemporaryDisabled, setPlaybackSetting, setNextSongPRNGSeed, props.setMusicSelection,
  ]);

  // restore the stored player name on first mount
  useEffect(() => {
    const storedName = loadPlayerName();
    if (storedName.length > 0 && storedName !== "Player") {
      judge.players[judge.myPlayerIndex].name = storedName;
      markJudgeChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A `?code=…&role=client|observer` deep link switches straight into the matching remote role and
  // prefills the share code, so the recipient only has to press connect. Runs once: the role is a
  // starting point, not a lock, so the user can still switch before joining. Skipped on phones and
  // narrow windows, where the game board is banned outright and creating a peer would be a pure
  // side effect on a page the user cannot reach.
  const canPlayGame = useCanPlayGame();
  useEffect(() => {
    if (!canPlayGame) { return; }
    const features = getFeatures();
    const prefill = resolveJoinLink(features.code, features.role);
    if (prefill === null) { return; }
    judge.matchType = prefill.role === "observer" ? MatchType.Observer : MatchType.Client;
    setRemotePlayerIdInput(prefill.code);
    peer.ensurePeerNotNull();
    resetOpponentDeck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // region timers

  const timerTextStartCountdown = useCallback(() => { timerRef.current?.startCountdown(); }, []);
  const timerTextStartRunning = useCallback(() => { timerRef.current?.startRunning(); }, []);
  const timerTextPause = useCallback(() => { timerRef.current?.pause(); }, []);

  const cpuOpponentCountdown = useCallback(() => {
    if (cpuOpponentClickTimeoutRef.current !== null) {
      clearTimeout(cpuOpponentClickTimeoutRef.current);
    }
    // The playground decides how hard this turn is: more cards mean a slower scan and a
    // higher chance of grabbing the wrong one.
    const cardCount = judge.playgroundCardCount();
    const shouldMistake = Math.random() < cpuMistakeRate(cpuOpponentSetting, cardCount);
    const delay = sampleCPUReactionTime(cpuOpponentSetting, cardCount);
    cpuOpponentClickTimeoutRef.current = setTimeout(() => {
      if (judge.matchType === MatchType.CPU && judge.state === GameJudgeState.TurnStart) {
        judge.simulateCPUOpponentPick(shouldMistake);
        markJudgeChanged();
      }
    }, delay * 1000);
  }, [cpuOpponentSetting, judge, markJudgeChanged]);

  const notifyTurnStarted = useCallback(() => {
    timerTextStartRunning();
    if (judge.matchType === MatchType.CPU) {
      cpuOpponentCountdown();
    }
  }, [judge.matchType, cpuOpponentCountdown, timerTextStartRunning]);

  const notifyTurnWinnerDetermined = useCallback(() => { timerTextPause(); }, [timerTextPause]);

  const notifyNextTurnCountdown = useCallback(() => {
    if (isServerClientObserver) {
      notifyPlayCountdownAudio();
      timerTextStartCountdown();
    }
  }, [isServerClientObserver, notifyPlayCountdownAudio, timerTextStartCountdown]);

  const handleStopGame = useCallback(() => {
    judge.state = GameJudgeState.SelectingCards;
    judge.stopGame();
    clearBoardInteraction();
    markJudgeChanged();
    notifyGameEnd();
  }, [judge, markJudgeChanged, notifyGameEnd, clearBoardInteraction]);

  const notifyStartGame = useCallback((order: Array<CharacterId> | null): Array<CharacterId> => {
    const newPlayingOrder = notifyGameStart(order);
    notifyPlayCountdownAudio();
    timerTextStartCountdown();
    return newPlayingOrder;
  }, [notifyGameStart, notifyPlayCountdownAudio, timerTextStartCountdown]);

  // hand the judge the UI callbacks it needs to drive the board
  // Give the rules engine its UI callbacks through the same post-commit effect the other
  // outer-ref fields are installed from.
  useEffect(() => {
    outerRef.current.notifyTurnStarted = notifyTurnStarted;
    outerRef.current.notifyTurnWinnerDetermined = notifyTurnWinnerDetermined;
    outerRef.current.notifyNextTurnCountdown = notifyNextTurnCountdown;
    outerRef.current.notifyStopGame = handleStopGame;
    outerRef.current.notifyStartGame = notifyStartGame;
  }, [
    notifyTurnStarted, notifyTurnWinnerDetermined, notifyNextTurnCountdown, handleStopGame,
    notifyStartGame,
  ]);

  // region actions

  const addRow = useCallback(() => {
    if (judge.deckRows >= MaxDeckRows) { return; }
    judge.adjustDeckSize(judge.deckRows + 1, judge.deckColumns, SendToAll);
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const removeRow = useCallback(() => {
    if (judge.deckRows <= 1) { return; }
    judge.adjustDeckSize(judge.deckRows - 1, judge.deckColumns, SendToAll);
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const addColumn = useCallback(() => {
    if (judge.deckColumns >= MaxDeckColumns) { return; }
    judge.adjustDeckSize(judge.deckRows, judge.deckColumns + 1, SendToAll);
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const removeColumn = useCallback(() => {
    if (judge.deckColumns <= 1) { return; }
    judge.adjustDeckSize(judge.deckRows, judge.deckColumns - 1, SendToAll);
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  // The deck the local controls edit. Observers (and extra melee clients) own no deck column, and
  // their deck controls are hidden, so fall back to the first deck for them.
  const localDeckIndex = (isMelee || judge.myPlayerIndex > 1) ? 0 : judge.myPlayerIndex;

  const filterByDeck = useCallback(() => {
    judge.filterMusicByDeck();
    judge.sendEvent({ type: "filterMusicByDeck" }, SendToAll);
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const randomFillDeck = useCallback(() => {
    judge.randomFillDeck(localDeckIndex, SendToAll);
    markJudgeChanged();
  }, [judge, localDeckIndex, markJudgeChanged]);

  const clearDeck = useCallback(() => {
    judge.clearDeck(localDeckIndex, SendToAll);
    markJudgeChanged();
  }, [judge, localDeckIndex, markJudgeChanged]);

  const shuffleDeck = useCallback(() => {
    judge.shuffleDeck(localDeckIndex, SendToAll);
    markJudgeChanged();
  }, [judge, localDeckIndex, markJudgeChanged]);

  const canStartGame = useCallback((): boolean => {
    if (judge.state !== GameJudgeState.SelectingCards) { return false; }
    if (judge.isDeckEmpty(0)) { return false; }
    if (judge.matchType !== MatchType.None && !isMelee && (judge.players.length < 2 || judge.isDeckEmpty(1))) {
      return false;
    }
    if (judge.players[judge.myPlayerIndex].confirmation.start) { return false; }
    return true;
  }, [judge, isMelee]);

  const handleStartGameButtonClick = useCallback(() => {
    if (judge.confirmStart(judge.myPlayerIndex).judgeChanged) {
      markJudgeChanged();
    }
  }, [judge, markJudgeChanged]);

  const handleNextTurnButtonClick = useCallback(() => {
    if (
      judge.state === GameJudgeState.TurnWinnerDetermined &&
      (((judge.isServer() || isCPU) && judge.givesLeft > 0) || (judge.isClient() && judge.givesLeft < 0))
    ) {
      judge.giveCardsRandomly(SendToAll);
      markJudgeChanged();
      return;
    }
    if (isCPU && judge.givesLeft < 0) {
      judge.giveCardsRandomly({ send: false, except: null });
      markJudgeChanged();
      return;
    }
    if (judge.confirmNext(judge.myPlayerIndex).judgeChanged) {
      markJudgeChanged();
    }
  }, [judge, isCPU, markJudgeChanged]);

  const handleStopGameButtonClick = useCallback(() => {
    judge.sendStopGame();
    handleStopGame();
  }, [judge, handleStopGame]);

  const startOrStopGame = useCallback(() => {
    if (judge.state === GameJudgeState.SelectingCards) {
      handleStartGameButtonClick();
    } else {
      handleStopGameButtonClick();
    }
  }, [judge.state, handleStartGameButtonClick, handleStopGameButtonClick]);

  const nextTurn = useCallback(() => { handleNextTurnButtonClick(); }, [handleNextTurnButtonClick]);

  const toggleTraditionalMode = useCallback(() => {
    judge.traditionalMode = !judge.traditionalMode;
    judge.sendEvent({
      type: "switchTraditionalMode",
      traditionalMode: judge.traditionalMode,
    }, SendToAll);
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const shuffleOpponentDeck = useCallback(() => {
    judge.shuffleDeck(1, { send: false, except: null });
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const clearOpponentDeck = useCallback(() => {
    judge.clearDeck(1, { send: false, except: null });
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const randomFillOpponentDeck = useCallback(() => {
    judge.randomFillDeck(1, { send: false, except: null });
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const switchOpponentType = useCallback(() => {
    if (judge.matchType === MatchType.None) {
      judge.matchType = MatchType.CPU;
      resetOpponentDeck();
    } else if (judge.matchType === MatchType.CPU) {
      judge.matchType = MatchType.Server;
      peer.ensurePeerNotNull();
      disconnectWebRTCIfAny();
      resetOpponentDeck();
    } else if (judge.matchType === MatchType.Server) {
      judge.matchType = MatchType.Client;
      peer.ensurePeerNotNull();
      disconnectWebRTCIfAny();
      resetOpponentDeck();
    } else if (judge.matchType === MatchType.Client) {
      judge.matchType = MatchType.Observer;
      peer.ensurePeerNotNull();
      disconnectWebRTCIfAny();
      resetOpponentDeck();
    } else {
      judge.matchType = MatchType.None;
      disconnectWebRTCIfAny();
      resetOpponentDeck();
    }
    markJudgeChanged();
  }, [judge, peer, disconnectWebRTCIfAny, resetOpponentDeck, markJudgeChanged]);

  const toggleClientObserver = useCallback(() => {
    judge.matchType = judge.matchType === MatchType.Client ? MatchType.Observer : MatchType.Client;
    peer.ensurePeerNotNull();
    disconnectWebRTCIfAny();
    resetOpponentDeck();
    markJudgeChanged();
  }, [judge, peer, disconnectWebRTCIfAny, resetOpponentDeck, markJudgeChanged]);

  const connectToServer = useCallback(() => {
    peer.connectToServer(remotePlayerIdInput);
  }, [peer, remotePlayerIdInput]);

  const regeneratePeerId = useCallback(() => { peer.ensurePeerNotNull(true); }, [peer]);

  const copyPeerId = useCallback(() => {
    if (peer.peer?.id) {
      navigator.clipboard.writeText(peer.peer.id);
    }
  }, [peer]);

  const copyJoinUrl = useCallback((role: JoinRole) => {
    const code = peer.peer?.id;
    if (!code || typeof window === "undefined") { return; }
    navigator.clipboard.writeText(buildJoinUrl(window.location.href, code, role));
  }, [peer]);

  const copyClientJoinUrl = useCallback(() => { copyJoinUrl("client"); }, [copyJoinUrl]);
  const copyObserverJoinUrl = useCallback(() => { copyJoinUrl("observer"); }, [copyJoinUrl]);

  const pickDeckCard = useCallback((playerIndex: 0 | 1, cardIndex: number, cardInfo: CardInfo) => {
    judge.notifyPickEvent(new PickEvent(
      Date.now() - judge.turnStartedAt(), judge.myPlayerIndex, cardInfo,
      { deckIndex: playerIndex, cardIndex },
    ), SendToAll);
    markJudgeChanged();
  }, [judge, markJudgeChanged]);

  const playMusic = useCallback(() => {
    notifyPlayMusic();
    judge.sendEvent({ type: "resumeMusic" }, SendToAll);
  }, [judge, notifyPlayMusic]);

  const pauseMusic = useCallback(() => {
    notifyPauseMusic();
    judge.sendEvent({ type: "pauseMusic" }, SendToAll);
  }, [judge, notifyPauseMusic]);

  const sendChatMessage = useCallback((message: string) => {
    const trimmed = message.trim();
    if (trimmed.length === 0) { return; }
    // The cheat string is consumed instead of being sent.
    if (isCheatString(trimmed)) {
      enableCheat();
      return;
    }
    const chatEvent: EventChat = {
      type: "chat",
      sender: judge.myPlayerIndex,
      message: message,
    };
    if (judge.isServer()) {
      judge.sendEvent(chatEvent, SendToAll);
    } else {
      judge.sendEventToServer(chatEvent);
    }
    setChatMessages((messages) => [...messages, {
      sender: judge.players[judge.myPlayerIndex].name,
      message: trimmed,
      role: "me",
    }]);
  }, [judge]);

  // region button models

  // region button models

  const startButton = computeStartButton(judge, {
    canStartGame: canStartGame(),
    isServerClientObserver,
    isSelectingCards,
    onClick: startOrStopGame,
  });

  const opponentButton = computeOpponentButton(judge, switchOpponentType);

  const nextTurnButton = computeNextTurnButton(judge, { isCPU, isServerClientObserver });
  const nextTurnInstruction = computeNextTurnInstruction(judge, { isCPU });

  return {
    judge,
    judgeVersion,
    peer,
    peerVersion,
    sendToAll: SendToAll,
    chatMessages,
    addSystemChatMessage,
    sendChatMessage,
    myName,
    setMyName: applyMyName,
    peerError,
    remotePlayerIdInput,
    setRemotePlayerIdInput,
    cpuOpponentSetting,
    setCpuOpponentSetting,
    cardWidthPercentage: boardSetting.cardWidthPercentage,
    unusedCards,
    dragInfo,
    setDragInfo,
    hoveringCardInfo,
    setHoveringCardInfo,
    localDeckIndex,
    isMusicFilteredByDeck,
    randomFillDisabled: !judge.canRandomFill(localDeckIndex, musicSelection),
    opponentRandomFillDisabled: !judge.canRandomFill(1, musicSelection),
    timerRef,
    isSelectingCards,
    isCPU,
    isMelee,
    isNoOpponent,
    isServerClientObserver,
    is1v1,
    startButton,
    opponentButton,
    nextTurnButton,
    nextTurnInstruction,
    markJudgeChanged,
    actions: {
      cardSmaller: boardSetting.cardSmaller,
      cardLarger: boardSetting.cardLarger,
      addRow,
      removeRow,
      addColumn,
      removeColumn,
      filterByDeck,
      randomFillDeck,
      clearDeck,
      shuffleDeck,
      startOrStopGame,
      nextTurn,
      toggleTraditionalMode,
      shuffleOpponentDeck,
      clearOpponentDeck,
      randomFillOpponentDeck,
      switchOpponentType,
      connectToServer,
      regeneratePeerId,
      copyPeerId,
      copyClientJoinUrl,
      copyObserverJoinUrl,
      toggleClientObserver,
      pickDeckCard,
      playMusic,
      pauseMusic,
    },
  };
}
