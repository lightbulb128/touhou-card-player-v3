import { Box, Button, Paper, Slider, Stack, TextField, Typography } from "@mui/material";
import { 
  CharacterId, 
  getMusicInfoFromCharacterId, GlobalData, 
  MusicSelectionMap, Playback, PlaybackSetting,
  PlaybackState, CardAspectRatio
} from "../types/Configs";
import { useState, useEffect, JSX, useRef } from "react";
import { 
  CardInfo, GameJudge, GameJudgeState, MatchType, OuterRefObject, 
  PickEvent, Player, DeckPosition, GamePeer,
  Event, SendOption,
  PlayerInfo,
  EventChat,
  ClientConnection
} from "../types/GameJudge";
import { CardBackgroundState, CharacterCard } from "./CharacterCard";
import {
  SkipNextRounded, PauseRounded, PlayArrowRounded, EastRounded, WestRounded,
  StopRounded, GroupsRounded, SmartToyRounded, PersonOffRounded,
  AddRounded, RemoveRounded, Casino, ClearRounded, ShuffleRounded,
  ClassRounded, StarRounded, FilterList,
  VolumeDownRounded as VolumeDown, VolumeUpRounded as VolumeUp,
  Pending,
} from "@mui/icons-material";
import { GameButton } from "./GameTabControls";
import { MonospaceFontFamily, NoFontFamily } from "./Theme";
import { GetLocalizedString, Localization } from "../types/Localization";
import ChatBox, { ChatMessage } from "./ChatBox";
import { CustomColors } from "../types/Consts";


export interface GameTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  playingOrder: Array<CharacterId>;
  playback: Playback,
  playbackState: PlaybackState,
  playbackSetting: PlaybackSetting,
  volume: number;
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
  setVolume: (volume: number) => void;
}

type CardRenderProps = {
  cardInfo: CardInfo;
  x: number;
  y: number;
  zIndex: number;
  transform?: string;
  width: string;
  source: string;
  backgroundState: CardBackgroundState;
  upsideDown: boolean;
  transition?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}
type CardPlaceholderRenderProps = {
  x: number;
  y: number;
  hidden: boolean;
}
type Position = {
  x: number;
  y: number;
}
type DragInfo = {
  dragging: boolean;
  mouseDownTimestamp: number;
  initialMouseX: number;
  initialMouseY: number;
  relativeToCardX: number;
  relativeToCardY: number;
  currentMouseX: number;
  currentMouseY: number;
  cardInfo: CardInfo;
  dragType: "fromSelectable" | "fromDeck";
  dragFromDeck: { deckIndex: 0 | 1; cardIndex: number } | null;
}
type TimerType = "countdown" | "running" | "paused" | "zero";
type TimerState = {
  type: TimerType;
  referenceTimestamp: number;
  time: number;
  intervalHandle: NodeJS.Timeout | null;
}
type CPUOpponentSetting = {
  reactionTimeMean: number;
  reactionTimeStdDev: number;
  mistakeRate: number;
}
const maxDeckRows = 5;
const maxDeckColumns = 15;

function getCardTransitionString(duration: string): string {
  return `top ${duration}, left ${duration}, transform ${duration}, background-color ${duration}, width ${duration}, height ${duration}`;
}

export default function GameTab({
  data, 
  musicSelection,
  currentCharacterId, 
  characterTemporaryDisabled,
  playingOrder,
  playbackState,
  playbackSetting,
  volume,
  musicStartTimestamp,
  notifyGameStart,
  notifyGameEnd,
  notifyPauseMusic,
  notifyPlayMusic,
  notifyPlayCountdownAudio,
  setCurrentCharacterId,
  setPlayingOrder,
  setCharacterTemporaryDisabled,
  setMusicSelection,
  setPlaybackSetting,
  setVolume,
  setNextSongPRNGSeed,
}: GameTabProps) {

  // region states
  const [, setForceRerender] = useState<object>({}); // used to force re-render
  const peerRef = useRef<GamePeer>(new GamePeer());
  const peer = peerRef.current;
  peer.refresh = () => { setForceRerender({}); };
  const outerRef = useRef<OuterRefObject>({
    globalData: data,
    playingOrder: playingOrder,
    characterTemporaryDisabled: characterTemporaryDisabled,
    currentCharacterId: currentCharacterId,
    musicSelection: musicSelection,
    playbackSetting: playbackSetting,
    setCurrentCharacterId: setCurrentCharacterId,
    setPlayingOrder: setPlayingOrder,
    setCharacterTemporaryDisabled: setCharacterTemporaryDisabled,
    setMusicSelection: setMusicSelection,
    setPlaybackSetting: setPlaybackSetting,
    setNextSongPRNGSeed: setNextSongPRNGSeed,
    notifyTurnWinnerDetermined: (_unused: Player | null) => {},
    notifyTurnStarted: (_characterId: CharacterId) => {},
    peer: peer,
    notifyStartGame: () => { return new Array<CharacterId>(); },
    notifyNextTurnCountdown: () => {},
    notifyStopGame: () => {},
    notifyOuterEventHandler: (_sender, _event: Event) => {},
    refresh: (judge: GameJudge) => { setJudge(judge.reconstruct()); },
  });
  const [judge, setJudge] = useState<GameJudge>(new GameJudge(outerRef));
  const judgeRef = useRef<GameJudge>(judge);
  const [cardWidthPercentage, setCardWidthPercentage] = useState<number>(0.08);
  const [cardSelectionSliderValue, setCardSelectionSliderValue] = useState<number>(0);
  const [unusedCards, setUnusedCards] = useState<CardInfo[]>([]);
  const [hoveringCardInfo, setHoveringCardInfo] = useState<CardInfo | null>(null);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [remotePlayerIdInput, setRemotePlayerIdInput] = useState<string>("");
  const [peerError, setPeerError] = useState<string>("")
  const [timerState, setTimerState] = useState<TimerState>({ 
    type: "zero", referenceTimestamp: 0, time: 0,
    intervalHandle: null
  });
  const [cpuOpponentSetting, setCpuOpponentSetting] = useState<CPUOpponentSetting>({
    reactionTimeMean: 6,
    reactionTimeStdDev: 0.5,
    mistakeRate: 0.2
  });
  const [cpuOpponentClickTimeout, setCpuOpponentClickTimeout] = useState<NodeJS.Timeout | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<ChatMessage>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const gref = useRef<{
    timerState: TimerState
  }>({
    timerState: timerState
  });

  const cards: Map<string, CardRenderProps> = new Map();
  const placeholderCards: Array<CardPlaceholderRenderProps> = new Array<CardPlaceholderRenderProps>();
  const naturalCardOrder: Array<CardInfo> = new Array<CardInfo>();
  const cardInsideDeck: Set<string> = new Set();
  const characterInsideDeck: Set<CharacterId> = new Set();
  const cardInsideCollected: Set<string> = new Set();
  const otherElements: Array<JSX.Element> = [];

  const canvasSpacing = 6;
  const canvasMargin = 16;
  const canvasWidth = (containerRef.current ? containerRef.current.clientWidth : 800);
  const cardWidth = canvasWidth * cardWidthPercentage;
  const cardHeight = cardWidth / CardAspectRatio;

  const isMelee = judge.isMelee();
  const isCPU = judge.matchType === MatchType.CPU;
  const isServerClientObserver = judge.isServerClientObserverMode();
  const isNoOpponent = judge.matchType === MatchType.None;
  const is1v1 = (isCPU) || (isServerClientObserver && !isMelee);
  const isSelectingCards = judge.state === GameJudgeState.SelectingCards;

  const playerNameHeight = 32;
  const sliderHeight = 28;
  const hoverRaiseHeight = 16; 
  const buttonSize = 36;
  const middleBarHeight = isSelectingCards ? (hoverRaiseHeight + cardHeight + canvasSpacing + sliderHeight) : 80;

  const deckColumns = judge.deckColumns; const deckRows = judge.deckRows;
  const deckWidth = deckColumns * cardWidth + (deckColumns - 1) * canvasSpacing;
  const deckHeight = deckRows * cardHeight + (deckRows - 1) * canvasSpacing;
  const deckLeft = (canvasWidth - deckWidth) / 2;
  const deckRight = deckLeft + deckWidth;

  const showPlayerName = !(judge.matchType === MatchType.None || judge.matchType === MatchType.CPU);
  const showOpponentName = showPlayerName && !(judge.isObserver() && isMelee) && !(isSelectingCards && isMelee);
  const showOpponentDeck = (judge.matchType === MatchType.CPU) || (isServerClientObserver && !isMelee);
  const showOpponentCollected = (!isSelectingCards) && (isServerClientObserver || isCPU) && (!isMelee || !judge.isObserver());
  const showPlayerCollected = (!isSelectingCards) || isMelee;

  let opponentCount = 0;
  const observerNames: Array<string> = [];
  for (let i = 1; i < judge.players.length; i++) {
    if (!judge.players[i].isObserver) { opponentCount += 1; }
    else { observerNames.push(judge.players[i].name); }
  }

  const opponentCollectedTop = canvasMargin;
  const opponentCollectedBottom = showOpponentCollected ? (opponentCollectedTop + cardHeight + hoverRaiseHeight) : opponentCollectedTop;
  
  const opponentNameTop = showOpponentCollected ? (opponentCollectedBottom + canvasSpacing) : opponentCollectedBottom;
  const opponentNameBottom = showOpponentName ? (opponentNameTop + playerNameHeight) : opponentNameTop;
  
  const opponentDeckTop = showOpponentName ? (opponentNameBottom + canvasSpacing) : opponentNameBottom;
  const opponentDeckBottom = showOpponentDeck ? (opponentDeckTop + deckHeight) : opponentDeckTop;

  const middleBarTop = showOpponentDeck ? (opponentDeckBottom + canvasSpacing) : opponentDeckBottom;
  const middleBarBottom = middleBarTop + middleBarHeight;
  
  const playerDeckTop = middleBarBottom + canvasSpacing;
  const playerDeckBottom = playerDeckTop + deckHeight;

  const playerNameTop = (!showPlayerName) ? (playerDeckBottom + (isMelee ? playerNameHeight : (isNoOpponent ? canvasMargin : 50))) : (
    (isSelectingCards) ? (playerDeckBottom + canvasMargin + buttonSize + canvasSpacing) : (playerDeckBottom + canvasSpacing + (isNoOpponent ? canvasMargin : 50))
  );
  const playerNameBottom = showPlayerName ? (playerNameTop + playerNameHeight) : playerNameTop;
  
  const playerCollectedTop = playerNameBottom + canvasSpacing;
  const playerCollectedBottom = showPlayerCollected ? (playerCollectedTop + cardHeight + hoverRaiseHeight) : playerCollectedTop;

  let canvasHeight = playerCollectedBottom + canvasMargin;
  
  const cardSelectionOverlap = cardWidth * 0.3;
  const sendToAll = { send: true, except: null } as SendOption;

  data.characterConfigs.forEach((characterConfig, characterId) => {
    characterConfig.card.forEach((cardId, index) => {
      const cardInfo = new CardInfo(characterId, index);
      const props: CardRenderProps = {
        cardInfo: cardInfo,
        x: 0, y: 0,
        zIndex: 0,
        width: `${cardWidth}px`,
        backgroundState: CardBackgroundState.Normal,
        source: cardId,
        upsideDown: false,
        onClick: undefined,
        onMouseEnter: undefined,
        onMouseLeave: undefined,
      }
      cards.set(cardInfo.toKey(), props);
      naturalCardOrder.push(cardInfo);
    })
  });

  judge.players.forEach((player) => {
    player.deck.forEach((cardInfo) => {
      cardInsideDeck.add(cardInfo.toKey());
      if (cardInfo.characterId !== null) {
        characterInsideDeck.add(cardInfo.characterId);
      }
    })
  });
  judge.players.forEach((player) => {
    player.collected.forEach((cardInfo) => {
      cardInsideCollected.add(cardInfo.toKey());
    });
  });

  if (judge.isServer()) {
    peer.resetListenerFromClient(judge.remoteEventListener.bind(judge));
  } else {
    const bindWith0 = (justData: unknown) => {
      judge.remoteEventListener(0, justData);
    }
    peer.resetListenerFromServer(bindWith0);
  }

  peer.notifyClientDisconnected = (id: number) => {

    if (id >= judge.players.length) {
      console.warn(`[GameTab] Client disconnected with id ${id}, but no such player exists.`);
      return;
    }

    const isObserver = judge.players[id].isObserver;

    if (!isObserver) {
      judge.state = GameJudgeState.SelectingCards;
      judge.stopGame();
      setDragInfo(null);
      setHoveringCardInfo(null);
      notifyGameEnd();
    }

    const message = GetLocalizedString(Localization.ChatMessageClientDisconnected, new Map<string, string>([[ "clientName", judge.players[id].name ]]));
    addSystemChatMessage(message);
    judge.sendEvent({
      type: "chat", sender: "system", message: message
    }, sendToAll);

    judge.removePlayer(id);

    // reorder peer connections
    const newDataConnections: Array<ClientConnection> = [];
    for (let i = 0; i < peer.dataConnectionToClients.length; i++) {
      if (peer.dataConnectionToClients[i].index < id) {
        newDataConnections.push(peer.dataConnectionToClients[i]);
      } else if (peer.dataConnectionToClients[i].index > id) {
        peer.dataConnectionToClients[i].index -= 1;
        newDataConnections.push(peer.dataConnectionToClients[i]);
      }
    }
    peer.dataConnectionToClients = newDataConnections;
    if (!isObserver) {
      judge.resetNonServerState();
    }

    judge.broadcastNames();
    setJudge(judge.reconstruct());

  }

  peer.notifyDisconnectedFromServer = () => {
    judge.state = GameJudgeState.SelectingCards;
    judge.stopGame();
    setDragInfo(null);
    setHoveringCardInfo(null);
    notifyGameEnd();
    const message = GetLocalizedString(Localization.ChatMessageServerDisconnected);
    addSystemChatMessage(message);
    if (judge.isClient() || judge.isObserver()) {
      if (judge.players.length > 2) {
        judge.players = [judge.players[0], judge.players[1]];
      }
      if (judge.players.length === 1) {
        judge.addPlayer();
      }
      judge.myPlayerIndex = 1;
    } else {
      judge.players = [judge.players[0]]
      judge.myPlayerIndex = 0;
    }
    judge.resetNonServerState();
    setJudge(judge.reconstruct());
  }

  peer.notifyClientConnected = (id: number) => {
    if (judge.players.length <= id) {
      judge.addPlayer();
    } else {
      console.warn(`[GameTab] Client connected with id ${id}, but player already exists.`);
      return;
    }
    peer.sendEventToClient({
      type: "syncSettings",
      traditionalMode: judge.traditionalMode,
      randomStartPosition: playbackSetting.randomStartPosition,
      playbackDuration: playbackSetting.playbackDuration,
      deckColumns: judge.deckColumns,
      deckRows: judge.deckRows,
    }, id)
    judge.resetGameState();
    // add a observer player
    setJudge(judge.reconstruct());
  }

  peer.notifyConnectedToServer = (_: GamePeer) => {
    if (judge.players.length <= 1) {
      judge.addPlayer();
    }
    judge.players = [judge.players[0], judge.players[1]];
    addSystemChatMessage(GetLocalizedString(Localization.ChatMessageConnectedToServer));
    setJudge(judge.reconstruct());
  }
    
  
  // region utility funcs

  const addSystemChatMessage = (message: string) => {
    const newMessage: ChatMessage = {
      role: "system",
      sender: GetLocalizedString(Localization.ChatMessageSenderSystem),
      message: message,
    }
    setChatMessages((messages) => [...messages, newMessage]);
  }

  // Here the allowedDeck only mean 0->near side, 1->far side, not player index.
  const canvasPositionToDeckPosition = (x: number, y: number, allowedDecks: Array<number> = [0, 1]): DeckPosition | null => {
    for (const deckIndex of allowedDecks as (0 | 1)[]) {
      if (!showOpponentDeck && deckIndex === 1) {
        continue;
      }
      const deckTop = deckIndex === 0 ? playerDeckTop : opponentDeckTop;
      if (y >= deckTop && y <= deckTop + deckHeight && x >= deckLeft && x <= deckLeft + deckWidth) {
        const relativeX = x - deckLeft;
        const relativeY = y - deckTop;
        let column = Math.floor(relativeX / (cardWidth + canvasSpacing));
        let row = Math.floor(relativeY / (cardHeight + canvasSpacing));
        if (relativeX < column * (cardWidth + canvasSpacing) + cardWidth && relativeY < row * (cardHeight + canvasSpacing) + cardHeight) {
          if (deckIndex === 1) {
            column = deckColumns - 1 - column;
            row = deckRows - 1 - row;
          }
          const cardIndex = row * deckColumns + column;
          return { deckIndex, cardIndex }
        }
      }
    }
    return null;
  }

  const updateUnusedCards = () => {
    const newUnused: Array<CardInfo> = [];
    const isUnused = (cardInfo: CardInfo): boolean => {
      if (cardInfo.characterId === null) { return false; }
      const characterId = cardInfo.characterId!;
      const musicIndex = musicSelection.get(characterId) || 0;
      if (musicIndex === -1) {
        return true;
      }
      if (judge.state !== GameJudgeState.SelectingCards) {
        // all that is not in {deck, collected} is unused
        if (cardInsideDeck.has(cardInfo.toKey()) || cardInsideCollected.has(cardInfo.toKey())) {
          return false;
        } else {
          return true;
        }
      }
      if (judge.state === GameJudgeState.SelectingCards) {
        if (dragInfo) {
          if (dragInfo.cardInfo.characterId === characterId && dragInfo.cardInfo.cardIndex !== cardInfo.cardIndex) {
            return true;
          }
        }
        if (characterInsideDeck.has(characterId) && !cardInsideDeck.has(cardInfo.toKey())) {
          return true;
        }
      }
      return false;
    };
    
    data.characterConfigs.forEach((characterConfig, characterId) => {
      characterConfig.card.forEach((cardId, index) => {
        const cardInfo = new CardInfo(characterId, index);
        if (isUnused(cardInfo)) {
          newUnused.push(cardInfo);
        }
      });
    });
    
    const unusedKeysSet = new Set<string>();
    let changed = false;
    const finalUnused: Array<CardInfo> = [];
    unusedCards.forEach((cardInfo) => {
      const key = cardInfo.toKey();
      if (isUnused(cardInfo) && !unusedKeysSet.has(key)) {
        unusedKeysSet.add(key);
        finalUnused.push(cardInfo);
      } else {
        changed = true;
      }
    });
    newUnused.forEach((cardInfo) => {
      const key = cardInfo.toKey();
      if (!unusedKeysSet.has(key)) {
        unusedKeysSet.add(key);
        finalUnused.push(cardInfo);
        changed = true;
      }
    });
    if (changed) {
      setUnusedCards(finalUnused);
    }
  }

  const timerTextStartCountdown = () => {
    setTimerState((timerState) => ({
      ...timerState,
      type: "countdown",
      referenceTimestamp: Date.now(),
      time: 0,
    }));
  }

  const timerTextStartRunning = () => {
    setTimerState((timerState) => ({
      ...timerState,
      type: "running",
      referenceTimestamp: Date.now(),
      time: 0,
    }));
  }

  const timerTextPause = () => {
    setTimerState((timerState) => ({
      ...timerState,
      type: "paused",
    }));
  }

  const disconnectWebRTCIfAny = () => {
    peer.disconnect();
  }

  const resetOpponentDeck = () => {
    judge.players = [judge.players[0]];

    if (judge.matchType === MatchType.CPU) {
      judge.addCPUPlayer();
    }
    judge.myPlayerIndex = 0;
    if (judge.matchType === MatchType.Client) {
      judge.players[0].deck = [];
      for (let j = 0; j < judge.deckRows * judge.deckColumns; j++) {
        judge.players[0].deck.push(new CardInfo(null, 0));
      }
      judge.addPlayer(judge.players[0].name, true);
      judge.players[1].isObserver = false;
      judge.myPlayerIndex = 1;
      judge.resetNonServerState();
    }
    if (judge.matchType === MatchType.Observer) {
      judge.players[0].deck = [];
      for (let j = 0; j < judge.deckRows * judge.deckColumns; j++) {
        judge.players[0].deck.push(new CardInfo(null, 0));
      }
      judge.addPlayer(judge.players[0].name, false);
      judge.players[1].isObserver = false;
      judge.myPlayerIndex = 1;
      judge.resetNonServerState();
    }
    setJudge(judge.reconstruct());
  }

  // region outer event handler
  const outerEventHandler = (sender: number, event: Event) => {

    const sendExcept = { send: true, except: sender } as SendOption;

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
        const newMessage: ChatMessage = {
          role: event.sender === "system" ? "system" : (judge.players[event.sender].isObserver ? "observer" : "peer"),
          sender: event.sender === "system" ? GetLocalizedString(Localization.ChatMessageSenderSystem) : judge.players[event.sender].name,
          message: event.message,
        }
        setChatMessages((messages) => [...messages, newMessage]);
        if (judge.isServer()) {
          judge.sendEvent(event, sendExcept);
        }
        break;
      }

      case "broadcastPlayerNames":
        const settings = event.settings;
        let message = "";
        settings.forEach((s, index) => {
          message += `${index === 0 ? "" : ", "}${s.name}`;
          if (index === 0) {
            message += ` (${GetLocalizedString(Localization.GameParticipantsServer)})`;
          } else if (index === judge.myPlayerIndex) {
            message += ` (${GetLocalizedString(Localization.GameParticipantsYou)})`;
            if (s.isObserver) {
              message += ` (${GetLocalizedString(Localization.GameObserver)})`;
            }
          } else if (s.isObserver) {
            message += ` (${GetLocalizedString(Localization.GameObserver)})`;
          } else {
            message += ` (${GetLocalizedString(Localization.GamePlayer)})`;
          }
        });
        addSystemChatMessage(
          GetLocalizedString(Localization.GameMessageParticipants)
          + ": " + message
        );
        break;
        
      case "notifyName": {
        if (!event.isObserver) {
          // reorganize players so that the clients are always in the first
          const newOrder = [];
          for (let i = 1; i < judge.players.length; i++) {
            if (!judge.players[i].isObserver) {newOrder.push(i);}
          }
          for (let i = 1; i < judge.players.length; i++) {
            if (judge.players[i].isObserver) {newOrder.push(i);}
          }
          let changed = false;
          for (let i = 1; i < judge.players.length; i++) {
            if (newOrder[i-1] !== i) {changed = true; break;}
          }
          const newPlayers: Array<PlayerInfo> = [];
          for (let i = 0; i < newOrder.length; i++) {
            const ori = peer.dataConnectionToClients[i].index;
            let found = false;
            for (let j = 0; j < judge.players.length; j++) {
              if (ori === newOrder[j]) {
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

          // reset states
          judge.resetNonServerState();

          judge.broadcastNames();
          setJudge(judge.reconstruct());
          addSystemChatMessage(GetLocalizedString(
            Localization.ChatMessageConnectedFromClient, new Map<string, string>([[ "clientName", event.name]])
          ));
        } else {
          judge.broadcastNames();
          addSystemChatMessage(GetLocalizedString(
            Localization.ChatMessageConnectedFromObserver, new Map<string, string>([[ "clientName", event.name]])
          ));
        }
      }
    }
  }
  outerRef.current.notifyOuterEventHandler = outerEventHandler;

  // region use effects

  // useEffect(() => {
  //   judge.sendNextTurnSync(outerNotifyMusicPlayStart.currentTime);
  // }, [outerNotifyMusicPlayStart])

  useEffect(() => {
    if (peerError) {
      console.error("Peer error:", peerError);
      addSystemChatMessage(GetLocalizedString(Localization.ChatMessagePeerConnectionError) + " - " + peerError);
    }
    peer.ensurePeerNotNull();
  }, [peerError]);

  useEffect(() => {
    judgeRef.current = judge;
  }, [judge]);

  useEffect(() => {
    gref.current.timerState = timerState;
  }, [timerState]);

  useEffect(() => {
    const handle = setInterval(() => {
      const timerState = gref.current.timerState;
      switch (timerState.type) {
        case "countdown": {
          const deltaTime = Date.now() - timerState.referenceTimestamp;
          const newTime = 3 - Math.floor(deltaTime / 1000);
          if (newTime <= 0) {
            // setTimerState((timerState) => ({
            //   ...timerState,
            //   type: "zero",
            //   time: 0,
            // }));
          } else {
            setTimerState((timerState) => ({
              ...timerState,
              time: newTime,
            }));
          }
          break;
        }
        case "running": {
          const deltaTime = Date.now() - timerState.referenceTimestamp;
          const newTime = deltaTime / 1000;
          setTimerState((timerState) => ({
            ...timerState,
            time: newTime,
          }));
          break;
        }
      }
    }, 20);
    setTimerState((timerState) => ({ ...timerState, intervalHandle: handle }));
    return () => { clearInterval(handle); }
  }, []);

  useEffect(() => {
    const inPlayingOrder = new Set<CharacterId>(playingOrder);
    playingOrder.forEach((charId) => {
      inPlayingOrder.add(charId);
    });
    // for all card in decks, check if in playing order.
    // if not, remove from deck.
    let deckChanged = false;
    judge.players.forEach((player, playerIndex) => {
      player.deck.forEach((cardInfo, cardIndex) => {
        if (cardInfo.characterId !== null && !inPlayingOrder.has(cardInfo.characterId)) {
          judge.removeFromDeck(playerIndex as 0 | 1, cardIndex, sendToAll);
          deckChanged = true;
        }
      });
    });
    if (deckChanged) {
      setJudge(judge => judge.reconstruct());
    }
  }, [playingOrder]);

  useEffect(() => {
    outerRef.current.globalData = data;
    outerRef.current.playingOrder = playingOrder;
    outerRef.current.characterTemporaryDisabled = characterTemporaryDisabled;
    outerRef.current.currentCharacterId = currentCharacterId;
    outerRef.current.musicSelection = musicSelection;
    outerRef.current.playbackSetting = playbackSetting;
    outerRef.current.peer = peer;
    outerRef.current.setCurrentCharacterId = setCurrentCharacterId;
    outerRef.current.setPlayingOrder = setPlayingOrder;
    outerRef.current.setCharacterTemporaryDisabled = setCharacterTemporaryDisabled;
    outerRef.current.setMusicSelection = setMusicSelection;
    outerRef.current.setPlaybackSetting = setPlaybackSetting;
    outerRef.current.setNextSongPRNGSeed = setNextSongPRNGSeed;
  }, [
    data,
    playingOrder, 
    characterTemporaryDisabled, 
    currentCharacterId,
    musicSelection,
    playbackSetting,
    peer,
    setCurrentCharacterId,
    setPlayingOrder,
    setCharacterTemporaryDisabled,
    setMusicSelection,
    setPlaybackSetting,
    setNextSongPRNGSeed,
  ]);

  useEffect(() => {
    // resize
    const handleResize = () => {
      setForceRerender({})
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  useEffect(() => {
    updateUnusedCards();
  }, [data, musicSelection, judge, dragInfo]);

  useEffect(() => {
    // save to local storage
    // if is default setting, do not save
    if (cardWidthPercentage === 0.08 && 
        judge.deckRows === 3 && 
        judge.deckColumns === 8) {
      return;
    }
    localStorage.setItem("gameSetting", JSON.stringify({
      cardWidthPercentage,
      deckRows: judge.deckRows,
      deckColumns: judge.deckColumns
    }));
  }, [cardWidthPercentage, judge.deckRows, judge.deckColumns]);

  useEffect(() => {
    // load myname from local storage
    const storedName = localStorage.getItem("myName");
    if (storedName && storedName.length > 0 && storedName !== "Player") {
      judge.players[0].name = storedName;
      setJudge(judge => judge.reconstruct());
    }
    // load game setting from local storage
    const storedSetting = localStorage.getItem("gameSetting");
    if (storedSetting) {
      try {
        const settingObj = JSON.parse(storedSetting);
        if (typeof settingObj.cardWidthPercentage === "number") {
          setCardWidthPercentage(settingObj.cardWidthPercentage);
        }
        if (typeof settingObj.deckRows === "number" && settingObj.deckRows >= 1 && settingObj.deckRows <= maxDeckRows) {
          judge.deckRows = settingObj.deckRows;
        }
        if (typeof settingObj.deckColumns === "number" && settingObj.deckColumns >= 1 && settingObj.deckColumns <= maxDeckColumns) {
          judge.deckColumns = settingObj.deckColumns;
        }
        judge.adjustDeckSize(judge.deckRows, judge.deckColumns, { send: false, except: null });
        setJudge(judge => judge.reconstruct());
      } catch (e) {
        console.error("Failed to parse stored game setting:", e);
      }
    }
  }, [])

  useEffect(() => {
    judge.turnStartTimestamp = musicStartTimestamp;
  }, [musicStartTimestamp]);
  
  // calculate anchor positions
  const toDeckCardPosition = (deckIndex: 0 | 1, cardIndex: number): Position => {
    const row = Math.floor(cardIndex / deckColumns);
    const column = cardIndex % deckColumns;
    if (deckIndex === 0) {
      return {
        x: deckLeft + column * (cardWidth + canvasSpacing),
        y: playerDeckTop + row * (cardHeight + canvasSpacing)
      }
    } else {
      return {
        x: deckLeft + (deckColumns - 1 - column) * (cardWidth + canvasSpacing),
        y: opponentDeckTop + (deckRows - 1 - row) * (cardHeight + canvasSpacing)
      }
    }
  }

  // region render cards

  // placeholders
  for (let deckIndex = 0; deckIndex < 2; deckIndex++) {
    if (deckIndex === 1 && (isMelee || judge.matchType === MatchType.None)) { continue; }
    const playerIndex = ((judge.isServer() || isCPU || isNoOpponent || isMelee) ? deckIndex : 1 - deckIndex) as 0 | 1;
    if (judge.players.length <= playerIndex) { continue; }
    const player = judge.players[playerIndex];
    const deck = player.deck;
    deck.forEach((cardInfo, index) => {
      {
        let placeholderHidden = cardInfo.characterId !== null;
        if (
          dragInfo !== null && 
          dragInfo.dragging && 
          dragInfo.dragType === "fromDeck" && 
          dragInfo.cardInfo.toKey() === cardInfo.toKey()
        ) {
          placeholderHidden = false;
        }
        placeholderCards.push({
          ...toDeckCardPosition(deckIndex as 0 | 1, index),
          hidden: placeholderHidden
        });
      }
    });
  }

  // decks
  judge.players.forEach((player, pi) => {
    const deck = player.deck;
    const playerIndex = pi as 0 | 1;
    if (playerIndex === 1 && !showOpponentDeck) {
      return;
    }
    const deckIndex = ((judge.isServer() || isCPU || isNoOpponent || isMelee) ? playerIndex : 1 - playerIndex) as 0 | 1;
    deck.forEach((cardInfo, index) => {
      if (cardInfo.characterId !== null) {
        const cardKey = cardInfo.toKey();
        const cardProps = cards.get(cardKey);
        if (cardProps === undefined) return;
        const pos = toDeckCardPosition(deckIndex, index);
        cardProps.x = pos.x;
        cardProps.y = pos.y;
        cardProps.zIndex = 200;
        if (deckIndex === 1) { cardProps.upsideDown = true; }
        let setHover = judge.state === GameJudgeState.SelectingCards;
        if (judge.state === GameJudgeState.TurnWinnerDetermined && deckIndex === 0) {
          setHover = true;
        }
        if (setHover && !judge.isObserver()) {
          cardProps.onMouseEnter = () => {
            setHoveringCardInfo(cardInfo);
          };
          cardProps.onMouseLeave = () => {
            setHoveringCardInfo(null);
          };
        }
        if (judge.state === GameJudgeState.TurnStart && !judge.isObserver()) {
          cardProps.onClick = () => {
            judge.notifyPickEvent(new PickEvent(
              Date.now() - musicStartTimestamp, judge.myPlayerIndex, cardInfo, 
              {deckIndex: playerIndex, cardIndex: index}
            ), { send: true, except: null });
            setJudge(judge.reconstruct());
          };
        }
      }
    });
  });

  // unused cards
  const unusedTotalWidthMax = cardWidth + 50;
  let unusedTotalWidth = (canvasWidth - deckWidth) / 2 - canvasSpacing - canvasMargin - 45;
  if (unusedTotalWidth > unusedTotalWidthMax) {
    unusedTotalWidth = unusedTotalWidthMax;
  }
  let unusedD = 0;
  if (unusedTotalWidth > cardWidth) {
    unusedD = (unusedTotalWidth - cardWidth) / (unusedCards.length - 1);
  }
  if (unusedD > 5) { unusedD = 5; }
  let unusedCardsYBase = playerDeckTop + deckHeight - cardHeight;
  if (isServerClientObserver && !isMelee) {
    unusedCardsYBase = opponentDeckTop + deckHeight - cardHeight - 30;
    if (judge.state !== GameJudgeState.SelectingCards) {
      unusedCardsYBase = middleBarBottom - cardHeight - 40;
    }
  } else if (isServerClientObserver && isMelee) {
    unusedCardsYBase = playerCollectedBottom - cardHeight;
  }
  if (unusedCardsYBase + cardHeight + 25 + canvasMargin > canvasHeight) {
    canvasHeight = unusedCardsYBase + cardHeight + 25 + canvasMargin;
  }
  const unusedCardsBottom = unusedCardsYBase + cardHeight;
  unusedCards.forEach((cardInfo, index) => {
    const cardKey = cardInfo.toKey();
    const cardProps = cards.get(cardKey);
    if (cardProps === undefined) return;
    cardProps.x = canvasMargin + unusedD * index;
    cardProps.y = unusedCardsYBase - unusedD * index;
    cardProps.zIndex = index;
  });

  judge.pickEvents.forEach((pickEvent) => {
    if (pickEvent.cardInfo.characterId === null) return;
    const cardKey = pickEvent.cardInfo.toKey();
    const cardProps = cards.get(cardKey);
    if (cardProps === undefined) return;
    const correct = pickEvent.characterId() === currentCharacterId;
    cardProps.backgroundState = correct ? CardBackgroundState.Correct : CardBackgroundState.Incorrect;
  });

  const selectableCardKeys: Array<CardInfo> = [];
  if (judge.state === GameJudgeState.SelectingCards) {
    naturalCardOrder.forEach((cardInfo) => {
      if (cardInfo.characterId === null) { return; }
      if (characterInsideDeck.has(cardInfo.characterId)) { return; }
      if (dragInfo && dragInfo.cardInfo.characterId === cardInfo.characterId) { 
        return; 
      }
      const characterId = cardInfo.characterId!;
      if (musicSelection.get(characterId) === -1) { return; }
      const cardKey = cardInfo.toKey();
      selectableCardKeys.push(cardInfo);
      const cardProps = cards.get(cardKey);
      if (cardProps === undefined) return;
      if (!judge.isObserver()) {
        cardProps.onMouseEnter = () => {
          setHoveringCardInfo(cardInfo);
        };
        cardProps.onMouseLeave = () => {
          setHoveringCardInfo(null);
        };
      }
    })
    const selectableTotalWidth = cardWidth + (selectableCardKeys.length - 1) * (cardWidth - cardSelectionOverlap);
    const offset = (selectableTotalWidth > deckWidth) ? (-cardSelectionSliderValue * (selectableTotalWidth - deckWidth)) : 0;
    selectableCardKeys.forEach((cardKey, index) => {
      const cardProps = cards.get(cardKey.toKey());
      if (cardProps === undefined) return;
      cardProps.x = deckLeft + index * (cardWidth - cardSelectionOverlap) + offset;
      cardProps.y = middleBarTop + 16;
      cardProps.zIndex = selectableCardKeys.length - index;
    });
  }

  // collecteds
  if (judge.state !== GameJudgeState.SelectingCards) {
    const observerNamesWidth = 150;
    let opponentIndex = 0;
    if (observerNames.length > 0) {
      // add observer list
      const x = (isMelee && judge.isObserver()) ? (canvasMargin + unusedTotalWidthMax + canvasMargin) : (canvasWidth - canvasMargin - observerNamesWidth);
      const y = (isMelee && judge.isObserver()) ? playerNameTop : opponentCollectedTop;
      otherElements.push(
        <Stack
          direction="column"
          key={`observer-name-list`}
          sx={{
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            width: `${observerNamesWidth}px`,
            height: `${cardHeight + canvasSpacing + playerNameHeight}px`,
            display: "flex",
          }}
        >
          <Typography 
            variant="h6" 
            sx={{ 
              width: `${observerNamesWidth}px`,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
              userSelect: "none",
              textAlign: "right",
            }} 
            fontFamily={NoFontFamily}
          >
            {GetLocalizedString(Localization.GameObserversList, new Map([["plural", observerNames.length > 1 ? "s" : ""]]))}
          </Typography>
          {judge.players.map((player, id) => {
            if (!player.isObserver) {return null;}
            return <Typography 
              key={`observer-name-${id}`}
              variant="body1" 
              sx={{ 
                width: `${observerNamesWidth}px`,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                overflow: "hidden",
                userSelect: "none",
                textAlign: "right",
                color: (id === judge.myPlayerIndex) ? CustomColors.selfColor : CustomColors.observerColor,
              }} 
              fontFamily={NoFontFamily}
              color={id === judge.myPlayerIndex ? "secondary" : "primary"}
            >
              {player.name}
            </Typography> 
          })}
        </Stack>
      );
      
    }

    judge.players.forEach((player, playerId) => {

      const d = player.collected;
      if (playerId === 1 && judge.matchType === MatchType.None) { return; }
      if (player.isObserver) { return; }

      // const deckId = (judge.isServer()) ? playerId : playerId;
      const onOpponentSide = judge.isObserver() ? (isMelee ? false : playerId === 0) : playerId !== judge.myPlayerIndex;
      const y = (!onOpponentSide) ? (playerCollectedTop + hoverRaiseHeight) : opponentCollectedTop;
      let startX = canvasWidth - canvasMargin - cardWidth * 2 - canvasSpacing;
      let totalWidth = canvasWidth - canvasMargin * 2;
      if (onOpponentSide) {
        if (observerNames.length > 0) {
          totalWidth -= observerNamesWidth + canvasMargin;
        }
        if (opponentCount === 1) {
          totalWidth -= cardWidth + canvasSpacing;
          startX = canvasMargin + cardWidth + canvasSpacing;
        } else {
          startX = canvasMargin + ((totalWidth - (opponentCount - 1) * canvasSpacing) / opponentCount + canvasSpacing) * opponentIndex;
          totalWidth = (totalWidth - (opponentCount - 1) * canvasSpacing) / opponentCount
        }
      } else {
        if (isMelee) {
          totalWidth -= unusedTotalWidthMax + canvasMargin;
        }
        if (judge.isObserver() && isMelee) {
          totalWidth = totalWidth - opponentCount * canvasSpacing - observerNamesWidth - canvasMargin;
          totalWidth = totalWidth / (opponentCount + 1);
          startX = canvasWidth - canvasMargin - (totalWidth + canvasSpacing) * (opponentCount - opponentIndex) - cardWidth;
        } else {
          totalWidth -= cardWidth + canvasSpacing;
        }
      }
      if (playerId !== judge.myPlayerIndex) { opponentIndex += 1; }

      totalWidth -= cardWidth;
      let delta = d.length === 1 ? 0 : totalWidth / (d.length - 1);
      if (delta > cardWidth * 0.66) { delta = cardWidth * 0.66; }
      if (!onOpponentSide) {delta = -delta;}

      // add a text element
      if ((!onOpponentSide || opponentCount === 1) && !(isMelee && judge.isObserver())) {
        const textLeft = (!onOpponentSide) ? (canvasWidth - canvasMargin - cardWidth) : canvasMargin;
        otherElements.push(
          <Box
            key={`collected-text-${playerId}`}
            sx={{
              position: "absolute",
              left: `${textLeft}px`,
              top: `${y}px`,
              width: `${cardWidth}px`,
              height: `${cardHeight}px`,
              textAlign: "center",
              pointerEvents: "none",
              alignItems: "center",
              justifyContent: "center",
              display: "flex",
            }}
          >
            <Typography variant="h3" sx={{ userSelect: "none" }} fontFamily={MonospaceFontFamily}>
              {d.length}
            </Typography> 
          </Box>
        );
      }

      if (onOpponentSide && opponentCount >= 2) {
        const textLeft = startX;
        const textY = opponentNameTop;
        otherElements.push(
          <Typography
            key={`opponent-name-deck-count-${playerId}`}
            sx={{
              position: "absolute",
              left: `${textLeft}px`,
              top: `${textY}px`,
              width: `${totalWidth + cardWidth}px`,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
              transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease, opacity 0.3s ease",
              fontFamily: NoFontFamily,
            }}
            variant="h6"
          >
            <span style={{color: CustomColors.opponentColor}}>
              {judge.isObserver() 
                ? GetLocalizedString(Localization.GamePlayer) 
                : GetLocalizedString(Localization.GameOpponent)} {player.name}
            </span> {GetLocalizedString(Localization.GameScore)}: {d.length} 
          </Typography>
        )
      }

      if (!onOpponentSide && isMelee && judge.isObserver()) {
        const textLeft = startX - totalWidth;
        const textY = playerNameTop;
        otherElements.push(
          <Typography
            key={`opponent-name-deck-count-${playerId}`}
            sx={{
              position: "absolute",
              left: `${textLeft}px`,
              top: `${textY}px`,
              width: `${totalWidth + cardWidth}px`,
              textAlign: "right",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
              transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease, opacity 0.3s ease",
              fontFamily: NoFontFamily,
            }}
            variant="h6"
          >
            <span style={{color: CustomColors.opponentColor}}>
              {GetLocalizedString(Localization.GamePlayer)} {player.name}
            </span> {GetLocalizedString(Localization.GameScore)}: {d.length} 
          </Typography>
        );
      }

      if (d.length === 0) { return; }
      d.forEach((cardInfo, index) => {
        const cardKey = cardInfo.toKey();
        const cardProps = cards.get(cardKey);
        if (cardProps === undefined) return;
        cardProps.x = startX + delta * index;
        cardProps.y = y;
        cardProps.zIndex = index;
        cardProps.onMouseEnter = () => {
          setHoveringCardInfo(cardInfo);
        };
        cardProps.onMouseLeave = () => {
          setHoveringCardInfo(null);
        };
        if (onOpponentSide) {
          cardProps.upsideDown = true;
        }
        if (hoveringCardInfo !== null && hoveringCardInfo.toKey() === cardInfo.toKey()) {
          cardProps.y += (!onOpponentSide) ? -16 : 16;
        }
      });
    });
  }

  // hovering when selecting
  if (judge.state === GameJudgeState.SelectingCards && hoveringCardInfo !== null && dragInfo === null) {
    const hoveringKey = hoveringCardInfo.toKey();
    const props = cards.get(hoveringKey);
    if (props !== undefined) {
      props.backgroundState = CardBackgroundState.Hover;
      if (!cardInsideDeck.has(hoveringKey)) {
        props.y -= 16;
      }
    }
  }
  if (judge.state !== GameJudgeState.SelectingCards && hoveringCardInfo !== null && dragInfo === null) {
    const hoveringKey = hoveringCardInfo.toKey();
    const props = cards.get(hoveringKey);
    if (props !== undefined) {
      props.backgroundState = CardBackgroundState.Hover;
      props.zIndex = 1000;
    }
  }

  // dragging when selecting
  if (judge.state === GameJudgeState.SelectingCards && dragInfo !== null) {
    const deckPos = canvasPositionToDeckPosition(
      dragInfo.currentMouseX,
      dragInfo.currentMouseY,
      // can drop to opponent deck if there is a opponent and it is not a remote player.
      (!showOpponentDeck || judge.matchType != MatchType.CPU) ? [0] : [0, 1]
    );
    const draggingKey = dragInfo.cardInfo.toKey();
    const props = cards.get(draggingKey);
    if (props !== undefined) {
      props.zIndex = 1000;
      props.transition = getCardTransitionString("0.1s");
      props.backgroundState = CardBackgroundState.Hover;
      if (deckPos === null) {
        props.x = dragInfo.currentMouseX - dragInfo.relativeToCardX;
        props.y = dragInfo.currentMouseY - dragInfo.relativeToCardY;
      } else {
        const pos = toDeckCardPosition(deckPos.deckIndex, deckPos.cardIndex);
        props.x = pos.x;
        props.y = pos.y;
        if (deckPos.deckIndex === 1) { props.upsideDown = true; }
      }
    }
  }

  if (judge.state === GameJudgeState.TurnWinnerDetermined && dragInfo !== null && dragInfo.dragType === "fromDeck") {
    const canDrop: Array<Player> = [0]; // only drop to self
    const canDropToOpponent = ((judge.isServer() || isCPU) && judge.givesLeft > 0) || (judge.isClient() && judge.givesLeft < 0);
    if (canDropToOpponent) {
      canDrop.push(1);
    }
    const deckPos = canvasPositionToDeckPosition(
      dragInfo.currentMouseX,
      dragInfo.currentMouseY,
      canDrop
    );
    const draggingKey = dragInfo.cardInfo.toKey();
    const props = cards.get(draggingKey);
    if (props !== undefined) {
      props.zIndex = 1000;
      props.transition = getCardTransitionString("0.1s");
      props.backgroundState = CardBackgroundState.Hover;
      let canDrop = false;
      if (deckPos !== null) {
        if (deckPos.deckIndex === 0) {
          // swap self cards.
          canDrop = true;
        } else if (is1v1) {
          // only if gives>0 and opponent slot is empty
          const opponentPlayerIndex = (judge.isClient()) ? 0 : 1;
          const givesLeft = (isCPU || judge.isServer()) ? (judge.givesLeft > 0) : (judge.givesLeft < 0);
          const isEmptySlot = judge.players[opponentPlayerIndex].deck[deckPos.cardIndex].characterId === null;
          if (givesLeft && isEmptySlot) {
            canDrop = true;
          }
        }
      }
      if (canDrop && deckPos !== null) {
        const pos = toDeckCardPosition(deckPos.deckIndex, deckPos.cardIndex);
        props.x = pos.x;
        props.y = pos.y;
        props.upsideDown = (deckPos.deckIndex === 1);
      } else {
        props.x = dragInfo.currentMouseX - dragInfo.relativeToCardX;
        props.y = dragInfo.currentMouseY - dragInfo.relativeToCardY;
      }
    }
  }

  // region handlers

  const handleMouseDownCanvas = (event: React.MouseEvent) => {
    if (judge.matchType === MatchType.Observer) { return; }
    const mouseX = event.clientX - (containerRef.current ? containerRef.current.getBoundingClientRect().left : 0);
    const mouseY = event.clientY - (containerRef.current ? containerRef.current.getBoundingClientRect().top : 0);
    if (judge.state === GameJudgeState.SelectingCards) {
      // check if mouse is on any selectable card
      for (let i = 0; i < selectableCardKeys.length; i++) {
        const cardInfo = selectableCardKeys[i];
        const cardProps = cards.get(cardInfo.toKey());
        if (cardProps === undefined) continue;
        const cardX = cardProps.x;
        const cardY = cardProps.y;
        const cardW = cardWidth;
        const cardH = cardHeight;
        if (
          mouseX >= cardX && mouseX <= cardX + cardW &&
          mouseY >= cardY && mouseY <= cardY + cardH
        ) {
          // start dragging
          setDragInfo({
            dragging: true,
            dragType: "fromSelectable",
            mouseDownTimestamp: Date.now(),
            initialMouseX: mouseX,
            initialMouseY: mouseY,
            relativeToCardX: mouseX - cardX,
            relativeToCardY: mouseY - cardY,
            cardInfo: cardProps.cardInfo,
            currentMouseX: mouseX,
            currentMouseY: mouseY,
            dragFromDeck: null,
          });
          // add other cards of the same character to unused
          break;
        }
      }
      // check if mouse on any deck card
      let deckPos = canvasPositionToDeckPosition(mouseX, mouseY, [0, 1]);
      if (isServerClientObserver && deckPos !== null && deckPos.deckIndex === 1) {
        deckPos = null; // when there is a remote opponent, cannot move cards from opponent's side.
      }
      if (deckPos !== null) {
        const playerIndex = (judge.isClient()) ? (1 - deckPos.deckIndex) : deckPos.deckIndex;
        const cardInfo = judge.getDeck(playerIndex, deckPos.cardIndex);
        if (cardInfo !== null) {
          // remove from deck
          setJudge(judge.reconstruct());
          // start dragging
          setDragInfo({
            dragging: true,
            dragType: "fromDeck",
            mouseDownTimestamp: Date.now(),
            initialMouseX: mouseX,
            initialMouseY: mouseY,
            relativeToCardX: mouseX - (toDeckCardPosition(deckPos.deckIndex, deckPos.cardIndex).x),
            relativeToCardY: mouseY - (toDeckCardPosition(deckPos.deckIndex, deckPos.cardIndex).y),
            cardInfo: cardInfo,
            currentMouseX: mouseX,
            currentMouseY: mouseY,
            dragFromDeck: { deckIndex: deckPos.deckIndex, cardIndex: deckPos.cardIndex },
          });
        }
      }
    }
    if (judge.state === GameJudgeState.TurnWinnerDetermined) {
      // check if mouse is on any deck card on self side.
      const deckPos = canvasPositionToDeckPosition(mouseX, mouseY, [0]);
      if (deckPos !== null) {
        const playerIndex = isMelee ? 0 : ( (judge.isClient()) ? 1 : 0 );
        const cardInfo = judge.getDeck(playerIndex, deckPos.cardIndex);
        if (cardInfo !== null) {
          setDragInfo({
            dragging: true,
            dragType: "fromDeck",
            mouseDownTimestamp: Date.now(),
            initialMouseX: mouseX,
            initialMouseY: mouseY,
            relativeToCardX: mouseX - (toDeckCardPosition(deckPos.deckIndex, deckPos.cardIndex).x),
            relativeToCardY: mouseY - (toDeckCardPosition(deckPos.deckIndex, deckPos.cardIndex).y),
            cardInfo: cardInfo,
            currentMouseX: mouseX,
            currentMouseY: mouseY,
            dragFromDeck: { deckIndex: deckPos.deckIndex, cardIndex: deckPos.cardIndex },
          });
        }
      }
    }
  }
  
  const handleMouseMoveCanvas = (event: React.MouseEvent) => {
    const mouseX = event.clientX - (containerRef.current ? containerRef.current.getBoundingClientRect().left : 0);
    const mouseY = event.clientY - (containerRef.current ? containerRef.current.getBoundingClientRect().top : 0);
    if (dragInfo && dragInfo.dragging) {
      setDragInfo({
        ...dragInfo,
        currentMouseX: mouseX,
        currentMouseY: mouseY,
      });
    }
  }

  const handleMouseUpCanvas = (event: React.MouseEvent) => {
    if (judge.matchType === MatchType.Observer) { return; }

    const mouseX = event.clientX - (containerRef.current ? containerRef.current.getBoundingClientRect().left : 0);
    const mouseY = event.clientY - (containerRef.current ? containerRef.current.getBoundingClientRect().top : 0);
    if (!dragInfo || !dragInfo.dragging) { return; }
    const currentTime = Date.now();
    // if mouse up too fast, see as a click
    const seeAsClick = currentTime - dragInfo.mouseDownTimestamp < 100;

    if (judge.state === GameJudgeState.SelectingCards) {
      let deckPos = canvasPositionToDeckPosition(
        mouseX,
        mouseY,
        // can drop to opponent deck if there is a opponent and it is not a remote player.
        (!showOpponentDeck || judge.matchType != MatchType.CPU) ? [0] : [0, 1]
      );

      if (seeAsClick) {
        if (dragInfo.dragType === "fromSelectable") {
          // add to deck at first empty slot
          if (deckPos === null) {
            const playerIndex = isMelee ? 0 : ((judge.isClient()) ? 1 : 0);
            for (let i = 0; i < judge.deckRows * judge.deckColumns; i++) {
              const already = judge.getDeck(playerIndex, i);
              if (already === null) {
                deckPos = { deckIndex: 0, cardIndex: i };
                break;
              }
            }
            if (deckPos === null && judge.matchType === MatchType.CPU) {
              // can also try to add to opponent deck
              for (let i = 0; i < judge.deckRows * judge.deckColumns; i++) {
                const already = judge.getDeck(1, i);
                if (already === null) {
                  deckPos = { deckIndex: 1, cardIndex: i };
                  break;
                }
              }
            }
          }
        } else if (dragInfo.dragType === "fromDeck") {
          deckPos = null;
        }
      }

      let fromDeckIndex = 0; let fromPlayerIndex = 0;

      if (dragInfo.dragType === "fromDeck") {

        fromDeckIndex = dragInfo.dragFromDeck!.deckIndex;
        fromPlayerIndex = isMelee ? 0 : ((judge.isClient()) ? (1 - fromDeckIndex) : fromDeckIndex);

      }

      if (deckPos !== null) {

        // if from deck, remove first
        if (dragInfo.dragType === "fromDeck") {
          judge.removeFromDeck(fromPlayerIndex, dragInfo.dragFromDeck!.cardIndex, sendToAll);
        }
        // check if already have, remove it first
        const toDeckIndex = deckPos.deckIndex;
        const toPlayerIndex = isMelee ? 0 : ((judge.isClient()) ? (1 - toDeckIndex) : toDeckIndex);
        const already = judge.getDeck(toPlayerIndex, deckPos.cardIndex);
        if (already !== null) {
          judge.removeFromDeck(toPlayerIndex, deckPos.cardIndex, sendToAll);
          if (dragInfo.dragType === "fromDeck") {
            // swap
            judge.addToDeck(fromPlayerIndex, already, dragInfo.dragFromDeck!.cardIndex, sendToAll);
          }
        }
        // add to deck
        judge.addToDeck(toPlayerIndex, dragInfo.cardInfo, deckPos.cardIndex, sendToAll);
        setJudge(judge.reconstruct());

      } else {

        if (dragInfo.dragType === "fromDeck") {
          // remove from deck
          judge.removeFromDeck(fromPlayerIndex, dragInfo.dragFromDeck!.cardIndex, sendToAll);
          setJudge(judge.reconstruct());
        }

      }
      setDragInfo(null);

    } else if (judge.state === GameJudgeState.TurnWinnerDetermined) {

      const canDrop = [0];
      const canDropToOpponent = ((judge.isServer() || isCPU) && judge.givesLeft > 0) || (judge.isClient() && judge.givesLeft < 0);
      if (canDropToOpponent) {
        canDrop.push(1);
      }
      let deckPos = canvasPositionToDeckPosition(
        mouseX,
        mouseY,
        canDrop
      );
      if (seeAsClick && canDropToOpponent && (
        deckPos === null || (deckPos.deckIndex === 0 && deckPos.cardIndex === dragInfo.dragFromDeck!.cardIndex)
      )) {
        // find the first place empty in opponent deck as deckPos
        for (let i = 0; i < judge.deckRows * judge.deckColumns; i++) {
          const opponentDeckIndex = (judge.isClient()) ? 0 : 1;
          const already = judge.getDeck(opponentDeckIndex, i);
          if (already === null) {
            deckPos = { deckIndex: 1, cardIndex: i };
            break;
          }
        }
      }
      if (deckPos !== null && deckPos.deckIndex === 1) {
        // if deckpos is not empty, set it to null
        const opponentPlayerIndex = (judge.isClient()) ? 0 : 1;
        if (judge.getDeck(opponentPlayerIndex, deckPos.cardIndex) !== null) {
          deckPos = null;
        }
      }
      // put to there
      if (deckPos !== null) {
        const selfPlayerIndex = isMelee ? 0 : ((judge.isClient()) ? 1 : 0);
        if (deckPos.deckIndex === 0) {
          // swap self cards
          const already = judge.getDeck(selfPlayerIndex, deckPos.cardIndex);
          judge.removeFromDeck(selfPlayerIndex, dragInfo.dragFromDeck!.cardIndex, sendToAll);
          if (already !== null) {
            judge.removeFromDeck(selfPlayerIndex, deckPos.cardIndex, sendToAll);
            judge.addToDeck(selfPlayerIndex, already, dragInfo.dragFromDeck!.cardIndex, sendToAll);
          }
          judge.addToDeck(selfPlayerIndex, dragInfo.cardInfo, deckPos.cardIndex, sendToAll);
        } else {
          // give
          const opponentPlayerIndex = (judge.isClient()) ? 0 : 1;
          judge.removeFromDeck(selfPlayerIndex, dragInfo.dragFromDeck!.cardIndex, sendToAll);
          judge.addToDeck(opponentPlayerIndex, dragInfo.cardInfo, deckPos.cardIndex, sendToAll);
          if (judge.isClient()) {
            judge.givesLeft += 1;
          } else {
            judge.givesLeft -= 1;
          }
          judge.sendEvent({ type: "give" }, { send: true, except: null });
        }
        setHoveringCardInfo(null);
        setJudge(judge.reconstruct());
      }
    }
    setDragInfo(null);
  }

  const cardWidthPercentageMin = 0.04;
  const cardWidthPercentageMax = 0.40;
  const handleCardLarger = () => {
    let newPercentage = cardWidthPercentage + 0.01;
    if (newPercentage > cardWidthPercentageMax) newPercentage = cardWidthPercentageMax;
    setCardWidthPercentage(newPercentage);
  }
  const handleCardSmaller = () => {
    let newPercentage = cardWidthPercentage - 0.01;
    if (newPercentage < cardWidthPercentageMin) newPercentage = cardWidthPercentageMin;
    setCardWidthPercentage(newPercentage);
  }

  const addDeckRow = () => {
    if (judge.deckRows >= maxDeckRows) return;
    judge.adjustDeckSize(judge.deckRows + 1, judge.deckColumns, sendToAll);
    setJudge(judge.reconstruct());
  }

  const removeDeckRow = () => {
    if (judge.deckRows <= 1) return;
    judge.adjustDeckSize(judge.deckRows - 1, judge.deckColumns, sendToAll);
    setJudge(judge.reconstruct());
  }

  const addDeckColumn = () => {
    if (judge.deckColumns >= maxDeckColumns) return;
    judge.adjustDeckSize(judge.deckRows, judge.deckColumns + 1, sendToAll);
    setJudge(judge.reconstruct());
  }

  const removeDeckColumn = () => {
    if (judge.deckColumns <= 1) return;
    judge.adjustDeckSize(judge.deckRows, judge.deckColumns - 1, sendToAll);
    setJudge(judge.reconstruct());
  }

  const canStartGame = () => {
    if (judge.state !== GameJudgeState.SelectingCards) return false;
    if (judge.isDeckEmpty(0)) return false;
    if (judge.matchType !== MatchType.None && !isMelee && (judge.players.length < 2 || judge.isDeckEmpty(1))) return false;
    if (judge.players[judge.myPlayerIndex].confirmation.start) return false;
    return true;
  }

  // returns the new playing order
  const handleStartGame = (order: Array<CharacterId> | null): Array<CharacterId> =>  {
    const newPlayingOrder = notifyGameStart(order);
    notifyPlayCountdownAudio();
    timerTextStartCountdown();
    return newPlayingOrder;
  }
  outerRef.current.notifyStartGame = handleStartGame;

  const handleStartGameButtonClick = () => {
    judge.confirmStart(judge.myPlayerIndex);
    setJudge(judge.reconstruct());
  }

  const cpuOpponentCountdown = () => {
    if (cpuOpponentClickTimeout !== null) {
      clearTimeout(cpuOpponentClickTimeout);
    }
    const shouldMistake = Math.random() < cpuOpponentSetting.mistakeRate;
    const delayMean = cpuOpponentSetting.reactionTimeMean;
    const delayStdDev = cpuOpponentSetting.reactionTimeStdDev;
    // [a, b] uniform distribution
    // with a = mu + sqrt(12)/2*sigma, b = mu - sqrt(12)/2*sigma
    const halfRange = Math.sqrt(12) / 2 * delayStdDev;
    let delay = delayMean + (Math.random() * 2 - 1) * halfRange;
    if (delay < 0.1) { delay = 0.1; }
    const timeout = setTimeout(() => {
      const judge = judgeRef.current;
      if (judge.matchType === MatchType.CPU && judge.state === GameJudgeState.TurnStart) {
        judge.simulateCPUOpponentPick(shouldMistake);
        setJudge(judge.reconstruct());
      }
    }, delay * 1000);
    setCpuOpponentClickTimeout(timeout);
  }

  const handleNextTurnCountdown = () => {
    if (isServerClientObserver) {
      notifyPlayCountdownAudio();
      timerTextStartCountdown();
    }
  }
  outerRef.current.notifyNextTurnCountdown = handleNextTurnCountdown;

  const handleNextTurnButtonClick = () => {
    if (
      judge.state === GameJudgeState.TurnWinnerDetermined 
      && (
        ((judge.isServer() || isCPU) && judge.givesLeft > 0) ||
        (judge.isClient() && judge.givesLeft < 0)
      )
    ) {
      judge.giveCardsRandomly(sendToAll);
      setJudge(judge.reconstruct());
      return;
    }
    if (judge.matchType === MatchType.CPU && judge.givesLeft < 0) {
      judge.giveCardsRandomly({send: false, except: null});
      setJudge(judge.reconstruct());
      return;
    }
    judge.confirmNext(judge.myPlayerIndex);
    setJudge(judge.reconstruct());
  }

  const handleStopGame = () => {
    judge.state = GameJudgeState.SelectingCards;
    judge.stopGame();
    setJudge(judge.reconstruct());
    setDragInfo(null);
    setHoveringCardInfo(null);
    notifyGameEnd();
  }
  outerRef.current.notifyStopGame = handleStopGame;

  const handleStopGameButtonClick = () => {
    judge.sendStopGame();
    handleStopGame();
  }

  const notifyTurnStarted = () => {
    timerTextStartRunning();
    if (judge.matchType === MatchType.CPU) {
      cpuOpponentCountdown();
    }
  }
  outerRef.current.notifyTurnStarted = notifyTurnStarted;

  const notifyTurnWinnerDetermined = () => {
    timerTextPause();
  }
  outerRef.current.notifyTurnWinnerDetermined = notifyTurnWinnerDetermined;

  const handlePlayMusicButtonPressed = () => {
    notifyPlayMusic();
    judge.sendEvent({ type: "resumeMusic" }, sendToAll);
  }

  const handlePauseMusicButtonPressed = () => {
    notifyPauseMusic();
    judge.sendEvent({ type: "pauseMusic" }, sendToAll);
  }

  const handlePeerError = (_id: number, error: string) => {
    setPeerError(error);
  }
  peer.notifyPeerError = handlePeerError;

  // region buttons
  
  // player deck right
  {
    let y = playerDeckTop;
    const x = deckRight + canvasMargin;
    { // card smaller button
      const disabled = cardWidthPercentage <= cardWidthPercentageMin;
      otherElements.push(
        <GameButton 
          key="card-smaller-button" 
          text={GetLocalizedString(Localization.GameCardSmaller)}
          onClick={handleCardSmaller} 
          disabled={disabled} 
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
        >
          <WestRounded></WestRounded>
        </GameButton>
      );
      y += buttonSize + canvasSpacing;
    }
    { // card larger button
      let disabled = cardWidthPercentage >= cardWidthPercentageMax;
      if (x + 150 + canvasMargin > canvasWidth) {
        disabled = true;
      }
      otherElements.push(
        <GameButton 
          key="card-larger-button" 
          text={GetLocalizedString(Localization.GameCardLarger)} 
          onClick={handleCardLarger} 
          disabled={disabled} 
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
        >
          <EastRounded></EastRounded>
        </GameButton>
      );
      y += buttonSize + canvasSpacing;
    }
    { // filter by deck
      const hidden = !(
        judge.state !== GameJudgeState.SelectingCards &&
        judge.state !== GameJudgeState.TurnCountdownNext
      ) || judge.isObserver()
      const disabled = judge.isMusicFilteredByDeck();
      otherElements.push(
        <GameButton 
          key="filter-by-deck-button"
          text={GetLocalizedString(Localization.GameFilterByDeck)}
          onClick={() => {
            judge.filterMusicByDeck();
            judge.sendEvent({ type: "filterMusicByDeck" }, sendToAll);
            setJudge(judge.reconstruct());
          }}
          disabled={disabled}
          hidden={hidden}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          <FilterList></FilterList>
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    { // start button
      // region start but
      const hidden = judge.isObserver();
      const isStopGameButton = judge.state !== GameJudgeState.SelectingCards;
      let disabled = (!isStopGameButton && !canStartGame()) || (judge.isClient() && judge.clientWaitAcknowledge);
      const contained = (
        !isStopGameButton &&
        isSelectingCards &&
        isServerClientObserver &&
        judge.checkAnyStartConfirmed()
      )
      let text = (isStopGameButton 
        ? GetLocalizedString(Localization.GameStop) 
        : GetLocalizedString(Localization.GameStart)
      );
      if (contained) {
        if (judge.players[judge.myPlayerIndex].confirmation.start) {
          text = GetLocalizedString(Localization.GameStartWaitingForOpponent);
          disabled = true;
        } else {
          text = GetLocalizedString(Localization.GameStart);
        }
      }
      const isGameFinished = judge.isGameFinished();
      if (judge.state !== GameJudgeState.SelectingCards && isGameFinished) {
        text = GetLocalizedString(Localization.GameFinish);
      }
      otherElements.push(
        <GameButton 
          key="start-button"
          text={text}
          disabled={disabled}
          hidden={hidden}
          color={!isGameFinished ? (contained ? "info" : "primary") : "secondary"}
          onClick={isStopGameButton ? handleStopGameButtonClick : handleStartGameButtonClick}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
          contained={contained}
        >
          {!isStopGameButton && <PlayArrowRounded
            htmlColor={(contained && !disabled) ? "white" : "inherit"}
          ></PlayArrowRounded>}
          {isStopGameButton && <StopRounded></StopRounded>}
        </GameButton>
      );
      if (!hidden) {
        y += buttonSize + canvasSpacing;
      }
    }
    { // random fill button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.isObserver();
      const disabled = hidden || judge.isDeckFull(isMelee ? 0 : judge.myPlayerIndex);
      otherElements.push(
        <GameButton 
          key="random-fill-button"
          text={GetLocalizedString(Localization.GameRandomFill)}
          onClick={() => {
            judge.randomFillDeck(isMelee ? 0 : judge.myPlayerIndex, sendToAll);
            setJudge(judge.reconstruct());
          }}
          disabled={disabled}
          hidden={hidden}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          <Casino></Casino>
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    { // clear deck button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.isObserver();
      const disabled = hidden || judge.isDeckEmpty(isMelee ? 0 : judge.myPlayerIndex);
      otherElements.push(
        <GameButton 
          key="clear-deck-button"
          text={GetLocalizedString(Localization.GameClearDeck)}
          onClick={() => {
            judge.clearDeck(isMelee ? 0 : judge.myPlayerIndex, sendToAll);
            setJudge(judge.reconstruct());
          }}
          disabled={disabled}
          hidden={hidden}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          <ClearRounded></ClearRounded>
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    { // shuffle deck button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.isObserver();
      const disabled = hidden || judge.isDeckEmpty(isMelee ? 0 : judge.myPlayerIndex);
      otherElements.push(
        <GameButton 
          key="shuffle-deck-button"
          text={GetLocalizedString(Localization.GameShuffleDeck)}
          onClick={() => {
            judge.shuffleDeck(isMelee ? 0 : judge.myPlayerIndex, sendToAll);
            setJudge(judge.reconstruct());
          }}
          disabled={disabled}
          hidden={hidden}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          <ShuffleRounded></ShuffleRounded>
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    { // switch mode button
      const hidden = judge.state !== GameJudgeState.SelectingCards && !judge.isObserver();
      let text = "";
      if (judge.matchType === MatchType.None) { 
        text = GetLocalizedString(Localization.GameOpponentNoOpponent);
      } else if (judge.matchType === MatchType.CPU) { 
        text = GetLocalizedString(Localization.GameOpponentCPUOpponent); 
      } else if (judge.matchType === MatchType.Server) {
        text = GetLocalizedString(Localization.GameOpponentRemoteAsServer); 
      } else if (judge.matchType === MatchType.Client) { 
        text = GetLocalizedString(Localization.GameOpponentRemoteAsClient);
      } else {
        text = GetLocalizedString(Localization.GameOpponentRemoteAsObserver);
      }
      otherElements.push(
        <GameButton 
          key="switch-opponent-type-button"
          hidden={hidden}
          text={text}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
          onClick={() => {
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
            setJudge(judge.reconstruct());
          }}  
        >
          {judge.matchType === MatchType.None && <PersonOffRounded></PersonOffRounded>}
          {judge.matchType === MatchType.CPU && <SmartToyRounded></SmartToyRounded>}
          {judge.isServerClientObserverMode() && <GroupsRounded></GroupsRounded>}
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    { // remove row button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.isObserver();
      const normalY = playerDeckTop + deckHeight - buttonSize * 2 - canvasSpacing;
      if (normalY > y) { y = normalY; }
      otherElements.push(
        <GameButton 
          key="remove-deck-row-button"
          onClick={removeDeckRow}
          disabled={hidden || judge.deckRows <= 1}
          hidden={hidden}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
        >
          <RemoveRounded></RemoveRounded>
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    { // add row button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.isObserver();
      otherElements.push(
        <GameButton 
          key="add-deck-row-button"
          onClick={addDeckRow}
          disabled={hidden || judge.deckRows >= maxDeckRows}
          hidden={hidden}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
        >
          <AddRounded></AddRounded>
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    if (y - canvasSpacing > canvasHeight) {
      canvasHeight = y - canvasSpacing + canvasMargin;
    }
  }

  // player deck bottom
  {
    const y = playerDeckTop + deckHeight + canvasMargin;
    if (y + buttonSize + canvasMargin > canvasHeight) {
      canvasHeight = y + buttonSize + canvasMargin;
    }
    let x = deckLeft + deckWidth - buttonSize;
    { // add column button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.isObserver();
      otherElements.push(
        <GameButton 
          key="add-deck-column-button"
          onClick={addDeckColumn}
          disabled={hidden || judge.deckColumns >= maxDeckColumns}
          hidden={hidden}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
        >
          <AddRounded></AddRounded>
        </GameButton>
      );
      if (!hidden) x -= buttonSize + canvasSpacing;
    }
    { // remove column button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.isObserver();
      otherElements.push(
        <GameButton 
          key="remove-deck-column-button"
          onClick={removeDeckColumn}
          disabled={hidden || judge.deckColumns <= 1}
          hidden={hidden}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
        >
          <RemoveRounded></RemoveRounded>
        </GameButton>
      );
      if (!hidden) x -= buttonSize + canvasSpacing;
    }
  }


  { // middlebar
    // region middle bar
    const middleBarShown = judge.state !== GameJudgeState.SelectingCards;
    const timerTextWidth = 150;
    const buttonSize = 47;
    let x = deckLeft;
    const y = middleBarTop;
    {
      let text = "";
      switch (timerState.type) {
        case "countdown":
          text = timerState.time.toFixed(0)
          break;
        case "running":
          text = timerState.time.toFixed(2)
          break;
        case "paused":
          text = timerState.time.toFixed(2)
          break;
        case "zero":
          text = "0"
          break;
      }
      otherElements.push(
        <Box
          key="game-timer-box"
          sx={{
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            width: `${timerTextWidth}px`,
            height: `${middleBarHeight}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000ff",
            opacity: middleBarShown ? 1.0 : 0.0,
            transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease, opacity 0.3s ease",
          }}
        >
        <Typography variant="h3" fontFamily={MonospaceFontFamily} sx={{
          userSelect: "none",
        }}>{text}</Typography> 
      </Box>
      );
      x += timerTextWidth + canvasSpacing;
    }
    { // text are intentionally set no opacity transition to avoid hinting the player of the correct answer
      const musicInfo = getMusicInfoFromCharacterId(data, musicSelection, currentCharacterId);
      const hidden = judge.state !== GameJudgeState.TurnWinnerDetermined;
      let width = deckWidth - (timerTextWidth + 3 * canvasSpacing + buttonSize * 2);
      if (judge.isObserver()) {
        width = deckWidth - (timerTextWidth + canvasSpacing);
      }
      otherElements.push(
        <Typography 
          key="music-title-text"
          variant="h6"
          sx={{
            position: "absolute",
            left: `${x}px`,
            top: `${y + middleBarHeight / 2}px`,
            transform: "translateY(-100%)",
            width: `${width}px`,
            opacity: (!middleBarShown || hidden) ? 0.0 : 1.0,
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            overflow: "hidden",
            transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease",
            userSelect: "none",
          }}
        >
          {currentCharacterId} / {musicInfo?.title}
        </Typography>
      );
      otherElements.push(
        <Typography 
          key="music-album-text"
          variant="subtitle1"
          sx={{
            position: "absolute",
            left: `${x}px`,
            top: `${y + middleBarHeight / 2}px`,
            textOverflow: "ellipsis",
            width: `${width}px`,
            opacity: (!middleBarShown || hidden) ? 0.0 : 1.0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease",
            userSelect: "none",
          }}
        >
          {musicInfo?.album}
        </Typography>
      );
      x = deckRight - buttonSize * 2 - canvasSpacing;
    }
    { // play/pause button
      // region play/pause
      const isPlay = playbackState !== PlaybackState.Playing;
      let isDisabled = playbackState === PlaybackState.CountingDown;
      const buttonY = y + middleBarHeight / 2 - buttonSize / 2;
      if (judge.state === GameJudgeState.TurnCountdownNext) {
        isDisabled = true;
      }
      const hidden = !middleBarShown || judge.isObserver();
      otherElements.push(
        <GameButton 
          key="play-pause-button"
          disabled={isDisabled}
          hidden={hidden}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${buttonY}px`,
            opacity: hidden ? 0.0 : 1.0,
            transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
          }}
          onClick={
            isPlay ? handlePlayMusicButtonPressed : handlePauseMusicButtonPressed
          }
        >
          {isPlay && <PlayArrowRounded fontSize="large"></PlayArrowRounded>}
          {!isPlay && <PauseRounded fontSize="large"></PauseRounded>}
        </GameButton>
      );
      x += buttonSize + canvasSpacing;
    }
    { // next turn button
      // region next turn
      let clickable = true;
      const buttonY = y + middleBarHeight / 2 - buttonSize / 2;
      const contained = (
        isServerClientObserver &&
        judge.checkAnyNextConfirmed()
      );
      let icon = "skip"
      let text = "";
      if (contained) {
        if (!judge.players[judge.myPlayerIndex].confirmation.next) {
          text = GetLocalizedString(Localization.GameNextTurnOpponentWaiting);
        } else {
          text = GetLocalizedString(Localization.GameNextTurnWaitingForOpponent);
          clickable = false;
        }
      }
      const hasGives = (judge.givesLeft > 0 && (judge.isServer() || isCPU)) || (judge.givesLeft < 0 && judge.isClient());
      const hasGiveCount = hasGives ? Math.abs(judge.givesLeft) : 0;
      const hasReceives = (judge.givesLeft < 0 && (judge.isServer() || isCPU)) || (judge.givesLeft > 0 && judge.isClient());
      const hasReceiveCount = hasReceives ? Math.abs(judge.givesLeft) : 0;
      if (judge.state === GameJudgeState.TurnWinnerDetermined && hasGives) {
        text = GetLocalizedString(Localization.GameNextTurnGiveCards, new Map<string, string>([
          ["givesLeft", hasGiveCount.toString()],
          ["plural", hasGiveCount > 1 ? "s" : ""],
        ]));
        icon = "shuffle";
      }
      if (judge.state === GameJudgeState.TurnWinnerDetermined && hasReceives) {
        text = GetLocalizedString(Localization.GameNextTurnReceiveCards, new Map<string, string>([
          ["receives", hasReceiveCount.toString()],
          ["plural", hasReceiveCount > 1 ? "s" : ""],
        ]));
        if (!isCPU) {clickable = false;}
        icon = "pending";
      }
      if (judge.isGameFinished()) {
        clickable = false;
        text = GetLocalizedString(Localization.GameNextTurnGameFinished);
        icon = "finished";
      }
      if (judge.state === GameJudgeState.TurnCountdownNext) {
        clickable = false;
      }
      const hidden = !middleBarShown || judge.isObserver();
      otherElements.push(
        <GameButton
          key="next-turn-button"
          disabled={!clickable}
          hidden={hidden}
          text={text}
          sx={{
            position: "absolute", left: `${x}px`, top: `${buttonY}px`,
            opacity: !hidden ? 1.0 : 0.0,
            transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
          }}
          onClick={handleNextTurnButtonClick}
          contained={contained}
          color={contained ? "info" : "primary"}
        >
          {icon === "skip" && <SkipNextRounded 
            fontSize="large"
            htmlColor={(contained && clickable) ? "white" : "inherit"}
          ></SkipNextRounded>}
          {icon === "pending" && <Pending 
            fontSize="large"
            htmlColor={(contained && clickable) ? "white" : "inherit"}
          ></Pending>}
          {icon === "finished" && <StopRounded
            fontSize="large"
            htmlColor={(contained && clickable) ? "white" : "inherit"}
          ></StopRounded>}
          {icon === "shuffle" && <ShuffleRounded
            fontSize="large"
            htmlColor={(contained && clickable) ? "white" : "inherit"}
          ></ShuffleRounded>}
        </GameButton>
      );
      if (judge.givesLeft != 0) {
        let text = "";
        if (hasGives) {
          text = GetLocalizedString(Localization.GameInstructionGiveCards, new Map<string, string>([
            ["givesLeft", hasGiveCount.toString()],
            ["plural", hasGiveCount > 1 ? "s" : ""],
          ]));
        } else if (hasReceives && !isCPU) {
          text = GetLocalizedString(Localization.GameInstructionReceiveCards, new Map<string, string>([
            ["receives", hasReceiveCount.toString()],
            ["plural", hasReceiveCount > 1 ? "s" : ""],
          ]));
          clickable = false;
        } else if (hasReceives && isCPU) {
          text = GetLocalizedString(Localization.GameInstructionReceiveCardsCPU, new Map<string, string>([
            ["receives", hasReceiveCount.toString()],
            ["plural", hasReceiveCount > 1 ? "s" : ""],
          ]));
        } else if (judge.isObserver()) {
          const giver = judge.givesLeft > 0 ? judge.players[0].name : judge.players[1].name;
          const receiver = judge.givesLeft > 0 ? judge.players[1].name : judge.players[0].name;
          const givesLeft = Math.abs(judge.givesLeft);
          const plural = givesLeft > 1 ? "s" : "";
          text = GetLocalizedString(Localization.GameInstructionObserverGive, new Map<string, string>([
            ["giver", giver],
            ["receiver", receiver],
            ["givesLeft", givesLeft.toString()],
            ["plural", plural],
          ]));
        }
        if (judge.isGameFinished()) {
          text = "";
        }
        if (text !== "") {
          otherElements.push(
            <Typography
              key="give-cards-instruction-text"
              variant="body1"
              sx={{
                userSelect: "none",
                position: "absolute",
                left: `${deckLeft}px`,
                top: `${playerDeckBottom + canvasMargin}px`,
                width: `${deckWidth}px`,
                fontFamily: NoFontFamily,
              }}
            >
              {text}
            </Typography>
          );
        }
      } 
    }
  }

  { // opponent connection 
    // region op conn
    let boxShown = false;
    let clientCount = 0;
    for (let i = 1; i < judge.players.length; i++) {
      if (!judge.players[i].isObserver) {
        clientCount += 1;
      }
    }
    if (judge.isServer() && clientCount === 0) { boxShown = true; }
    if ((judge.isClient() || judge.isObserver()) && peer.dataConnectionToServer === null) { boxShown = true; } 
    if (boxShown) {
      otherElements.push(
        <Paper
          key="opponent-connection-paper"
          sx={{
            position: "absolute",
            left: `${deckLeft - 5}px`,
            top: `${opponentDeckTop - 5}px`,
            width: `${deckWidth + 10}px`,
            height: `${deckHeight + 5}px`,
            backgroundColor: "#000000ff",
            zIndex: 1500,
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
          }}
        >
          <Stack
            key="opponent-connection-box"
            direction="column"
            spacing={1}
            padding={1}
            sx={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            
            <Typography 
              key="player-name-text"
              variant="body1"
              sx={{
                userSelect: "none",
                textAlign: "left",
                width: "100%",
                paddingLeft: "4px",
                fontFamily: NoFontFamily,
              }}
            >
              {GetLocalizedString(Localization.GameConnectionMyName)}
            </Typography>
            <TextField
              size="small"
              sx={{ 
                width: "100%",
              }}
              slotProps={{
                input: { style: { fontFamily: NoFontFamily } }
              }}
              value={judge.players[judge.isServer() ? 0 : 1].name}
              onChange={(e) => {
                localStorage.setItem("myName", e.target.value);
                judge.players[judge.isServer() ? 0 : 1].name = e.target.value;
                setJudge(judge.reconstruct());
              }}
            />
            <Typography 
              variant="body1"
              sx={{
                userSelect: "none",
                textAlign: "left",
                width: "100%",
                paddingLeft: "4px",
                fontFamily: NoFontFamily,
              }}
            >
              {judge.isServer() 
                ? GetLocalizedString(Localization.GameConnectShareCodeInstruction) 
                : GetLocalizedString(Localization.GameConnectEnterCodeInstruction)}
            </Typography>
            <TextField
              size="small"
              multiline
              sx={{ 
                width: "100%",
              }}
              slotProps={{
                input: { style: { fontFamily: NoFontFamily } }
              }}
              value={judge.isServer()  ? (peer.peer?.id ?? GetLocalizedString(Localization.GameConnectionGeneratingId)) : remotePlayerIdInput}
              onChange={(e) => {
                setRemotePlayerIdInput(e.target.value);
              }}
            />
            {!judge.isServer()  && <Button
              onClick={() => {
                peer.connectToServer(remotePlayerIdInput);
              }}
              sx={{fontFamily: NoFontFamily}}
              variant="outlined"
            >
              {GetLocalizedString(Localization.GameConnectionConnect)}
            </Button>}
            {judge.isServer()  && <Stack
              direction="row"
              spacing={1}
            >
              <Button
                onClick={() => {
                  peer.ensurePeerNotNull(true);
                }}
                variant="outlined"
                color="secondary"
                sx={{fontFamily: NoFontFamily}}
              >
                {(peer.peer?.id === null || peer.peer?.id === undefined)
                  ? GetLocalizedString(Localization.GameConnectionRetryGeneration)
                  : GetLocalizedString(Localization.GameConnectionRegenerate)}
              </Button>
              <Button
                onClick={() => {
                  // copy to clipboard
                  if (peer.peer?.id) {
                    navigator.clipboard.writeText(peer.peer.id);
                  }
                }}
                sx={{fontFamily: NoFontFamily}}
                disabled={peer.peer?.id === null || peer.peer?.id === undefined}
                variant="outlined"
              >
                {GetLocalizedString(Localization.GameConnectionCopyToClipboard)}
              </Button>
            </Stack>}
          </Stack>
        </Paper>
      );
    }
  }
  
  { // player left
    const x = deckLeft - canvasMargin;
    const iconSize = 24;
    let y = playerDeckTop;
    {
      otherElements.push(
        <VolumeUp fontSize="small"
          key="volume-up-label"
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
            transform: "translateX(-100%)",
            transition: "left 0.3s ease, top 0.3s ease"
          }}
        ></VolumeUp>
      );
      y += iconSize + canvasSpacing;
      let sliderHeight = cardHeight - iconSize * 2 - canvasSpacing * 2;
      if (sliderHeight < 50) { sliderHeight = 50; }
      otherElements.push(
        <Slider
          size="small"
          key="volume-slider"
          orientation="vertical"
          value={volume}
          onChange={(e, newValue) => {
            const vol = Array.isArray(newValue) ? newValue[0] : newValue;
            setVolume(vol);
          }}
          min={0} max={1} step={0.10}
          sx={{
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            height: `${sliderHeight}px`,
            transform: "translateX(-85%)",
            transition: "left 0.3s ease, top 0.3s ease, height 0.3s ease"
          }}
        />
      );
      y += sliderHeight + canvasSpacing;
      otherElements.push(
        <VolumeDown fontSize="small"
          key="volume-down-label"
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
            transform: "translateX(-100%)",
            transition: "left 0.3s ease, top 0.3s ease"
          }}
        ></VolumeDown>
      );
    }
  }

  { // opponent deck right
    // region op right
    const x = deckRight + canvasMargin;
    let y = opponentDeckBottom - buttonSize;
    { // traditional mode button
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.matchType === MatchType.None || isMelee;
      otherElements.push(
        <GameButton
          key="opponent-traditional-mode-button"
          hidden={hidden}
          disabled={judge.isObserver()}
          text={judge.traditionalMode 
            ? GetLocalizedString(Localization.GameModeTraditional) 
            : GetLocalizedString(Localization.GameModeNonTraditional)}
          onClick={() => {
            judge.traditionalMode = !judge.traditionalMode;
            judge.sendEvent({
              type: "switchTraditionalMode",
              traditionalMode: judge.traditionalMode,
            }, sendToAll)
            setJudge(judge.reconstruct());
          }}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          {judge.traditionalMode ? <ClassRounded></ClassRounded> : <StarRounded></StarRounded>}
        </GameButton>
      );
      y -= buttonSize + canvasSpacing;
    } 
    { // traditional mode explanation
      const hidden = !is1v1 || judge.state !== GameJudgeState.SelectingCards;
      const text = (judge.traditionalMode 
        ? GetLocalizedString(Localization.GameModeTraditionalDescription)
        : GetLocalizedString(Localization.GameModeNonTraditionalDescription)
      )
      otherElements.push(
        <Typography
          key="opponent-traditional-mode-explanation"
          variant="body1"
          sx={{
            userSelect: "none",
            position: "absolute",
            left: `${deckLeft}px`,
            top: `${playerDeckBottom + canvasMargin}px`,
            width: `${deckWidth - buttonSize * 2 - canvasMargin}px`,
            opacity: hidden ? 0.0 : 1.0,
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
            fontFamily: NoFontFamily,
          }}
        >
          {text.split("\n").map((line, index) => (
            <span key={index}>
              {line}
              <br />
            </span>
          ))}
        </Typography>
      );
    }
    { // shuffle deck for opponent
      const hidden = !isSelectingCards || !isCPU;
      const disabled = hidden ? true : (judge.players.length < 2 || judge.isDeckEmpty(1));
      otherElements.push(
        <GameButton
          key="shuffle-opponent-deck-button"
          disabled={disabled}
          hidden={hidden}
          text={GetLocalizedString(Localization.GameShuffleDeck)}
          onClick={() => {
            judge.shuffleDeck(1, {send: false, except: null});
            setJudge(judge.reconstruct());
          }}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          <ShuffleRounded></ShuffleRounded>
        </GameButton>
      );
      y -= buttonSize + canvasSpacing;
    }
    { // clear deck for opponent
      const hidden = !isSelectingCards || !isCPU;
      const disabled = hidden ? true : (judge.players.length < 2 || judge.isDeckEmpty(1));
      otherElements.push(
        <GameButton
          key="clear-opponent-deck-button"
          disabled={disabled}
          hidden={hidden}
          text={GetLocalizedString(Localization.GameClearDeck)}
          onClick={() => {
            judge.clearDeck(1, {send: false, except: null});
            setJudge(judge.reconstruct());
          }}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          <ClearRounded></ClearRounded>
        </GameButton>
      );
      y -= buttonSize + canvasSpacing;
    }
    { // random fill opponent deck
      const hidden = !isSelectingCards || !isCPU;
      const disabled = hidden ? true : (judge.players.length < 2 || judge.isDeckFull(1));
      otherElements.push(
        <GameButton
          key="random-fill-opponent-deck-button"
          disabled={disabled}
          hidden={hidden}
          text={GetLocalizedString(Localization.GameRandomFill)}
          onClick={() => {
            judge.randomFillDeck(1, {send: false, except: null});
            setJudge(judge.reconstruct());
          }}
          sx={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
          }}
        >
          <Casino></Casino>
        </GameButton>
      );
      y -= buttonSize + canvasSpacing;
    }
  }

  { // op left
    const x = deckLeft - canvasMargin;
    let y = opponentDeckTop;
    const shown = (
      judge.state === GameJudgeState.SelectingCards &&
      judge.matchType === MatchType.CPU
    );
    const hidden = !shown;
    {
      otherElements.push(
        <Typography
          key="opponent-deck-label"
          variant="h6"
          sx={{
            userSelect: "none",
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            transform: "translateX(-100%)",
            opacity: hidden ? 0.0 : 1.0,
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
            fontFamily: NoFontFamily,
          }}
        >
          {GetLocalizedString(Localization.GameOpponentSettingTitle)}
        </Typography>
      );
      y += 24 + canvasSpacing;
    }
    {
      otherElements.push(
        <Typography
          key="opponent-deck-instruction"
          variant="body1"
          sx={{
            userSelect: "none",
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            transform: "translateX(-100%)",
            opacity: hidden ? 0.0 : 1.0,
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
            fontFamily: NoFontFamily,
          }}
        >
          {GetLocalizedString(Localization.GameOpponentSettingReactionTime)}
        </Typography>
      );
      y += 24 + canvasSpacing;
    }
    {
      otherElements.push(
        <TextField
          key="opponent-reaction-time-input"
          type="number"
          size="small"
          value={cpuOpponentSetting.reactionTimeMean}
          label={GetLocalizedString(Localization.GameOpponentSettingReactionTimeMean)}
          disabled={hidden}
          onChange={(e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 1.0;
            if (val < 0.5) val = 0.5;
            if (val > 10) val = 10;
            setCpuOpponentSetting({
              ...cpuOpponentSetting,
              reactionTimeMean: val,
            });
          }}
          slotProps={{
            htmlInput: {
              min: 0.5,
              max: 10,
              step: 0.5,
            },
            inputLabel: { style: { fontFamily: NoFontFamily } },
          }}
          sx={{
            width: "160px",
            userSelect: "none",
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            opacity: hidden ? 0.0 : 1.0,
            transform: "translateX(-100%)",
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
          }}
        ></TextField>
      );
      y += 44 + canvasSpacing;
    }
    {
      otherElements.push(
        <TextField
          key="opponent-reaction-time-stddev-input"
          type="number"
          size="small"
          value={cpuOpponentSetting.reactionTimeStdDev}
          label={GetLocalizedString(Localization.GameOpponentSettingReactionTimeStdDev)}
          disabled={hidden}
          onChange={(e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 0.1;
            if (val < 0.0) val = 0.0;
            if (val > 5) val = 5;
            setCpuOpponentSetting({
              ...cpuOpponentSetting,
              reactionTimeStdDev: val,
            });
          }}
          slotProps={{
            htmlInput: {
              min: 0.0,
              max: 5,
              step: 0.1,
            },
            inputLabel: { style: { fontFamily: NoFontFamily } },
          }}
          sx={{
            width: "160px",
            userSelect: "none",
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            opacity: hidden ? 0.0 : 1.0,
            transform: "translateX(-100%)",
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
          }}
        ></TextField>
      );
      y += 36 + canvasSpacing;
    }
    { 
      otherElements.push(
        <Typography
          key="opponent-mistake-rate-label"
          variant="body1"
          sx={{
            userSelect: "none",
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            transform: "translateX(-100%)",
            opacity: hidden ? 0.0 : 1.0,
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
            fontFamily: NoFontFamily,
          }}
        >
          {GetLocalizedString(Localization.GameOpponentSettingMistakeRate)}
        </Typography>
      );
      y += 24 + canvasSpacing; 
    }
    {
      otherElements.push(
        <TextField
          key="opponent-mistake-rate-input"
          type="number"
          size="small"
          value={cpuOpponentSetting.mistakeRate * 100.0}
          label={GetLocalizedString(Localization.GameOpponentSettingMistakeRate)}
          disabled={hidden}
          onChange={(e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 0.0;
            if (val < 0.0) val = 0.0;
            if (val > 100.0) val = 100.0;
            setCpuOpponentSetting({
              ...cpuOpponentSetting,
              mistakeRate: val / 100.0,
            });
          }}
          slotProps={{
            htmlInput: {
              min: 0.0,
              max: 100.0,
              step: 1.0,
            },
            inputLabel: { style: { fontFamily: NoFontFamily } },
          }}
          sx={{
            width: "160px",
            userSelect: "none",
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            opacity: hidden ? 0.0 : 1.0,
            transform: "translateX(-100%)",
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
          }}
        ></TextField>
      );
      y += 44 + canvasSpacing;
    }
  }

  // region player name
  // player names
  {
    { // self name
      const shown = showPlayerName && !(isMelee && judge.isObserver()) && !(judge.isObserver() && !peer.hasConnectionToServer());
      const y = playerNameTop;
      let x = canvasWidth - deckLeft - deckWidth;
      if (judge.state !== GameJudgeState.SelectingCards) {
        x = canvasMargin;
      }
      const name = !shown ? "" : (judge.isObserver() ? judge.players[1].name : judge.players[judge.myPlayerIndex].name);
      otherElements.push(
        <Typography 
          key="player-name-text"
          variant="h6"
          sx={{
            userSelect: "none",
            position: "absolute",
            right: `${x}px`,
            top: `${y}px`,
            opacity: shown ? 1.0 : 0.0,
            transition: "right 0.3s ease, top 0.3s ease, opacity 0.3s ease",
            fontFamily: NoFontFamily,
            textAlign: "right",
            width: deckWidth,
            color: judge.isObserver() ? CustomColors.opponentColor : CustomColors.selfColor,
          }}
        >
          {GetLocalizedString(Localization.GamePlayer)} {name}
        </Typography>
      );
      if (y + playerNameHeight + canvasMargin > canvasHeight) {
        canvasHeight = y + playerNameHeight + canvasMargin;
      }
    }
    { // opponent name
      let shown = showPlayerName && is1v1;
      if (judge.isClient() && !peer.hasConnectionToServer()) {shown = false;}
      if (judge.isObserver()) {
        if (!peer.hasConnectionToServer()) {shown = false;}
        else {
          if (judge.players[1].isObserver) {shown = false;}
        }
      }
      if (judge.isServer()) {
        if (judge.players.length < 2 || judge.players[1].isObserver) {shown = false;}
      }
      const name = shown ? judge.players[judge.isServer() ? 1 : 0].name : "";
      const y = opponentNameTop;
      let x = deckLeft;
      if (judge.state !== GameJudgeState.SelectingCards) {
        x = canvasMargin;
      }
      otherElements.push(
        <Typography 
          key="opponent-name-text"
          variant="h6"
          sx={{
            userSelect: "none",
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            opacity: shown ? 1.0 : 0.0,
            transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
            fontFamily: NoFontFamily,
            color: CustomColors.opponentColor,
          }}
        >
          {judge.isObserver() ? GetLocalizedString(Localization.GamePlayer) : GetLocalizedString(Localization.GameOpponent)} {name}
        </Typography>
      );
    }
  }

  // chat messages box
  // region chat box
  {
    const width = deckLeft - canvasMargin * 2 - 40;
    const y = playerDeckTop;
    const x = canvasMargin;
    const shown = isServerClientObserver;
    otherElements.push(
      <Box
        key="chat-messages-box"
        sx={{
          position: "absolute",
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${deckHeight}px`,
          transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease, opacity 0.3s ease",
          opacity: shown ? 1.0 : 0.0,
          alignItems: "flex-end",
          display: "flex",
          overflow: "hidden",
        }}
      >
        <ChatBox
          messages={chatMessages}
          onSendMessage={(message: string) => {
            const trimmed = message.trim();
            if (trimmed.length === 0) return;
            const newMessage: ChatMessage = {
              sender: judge.players[judge.myPlayerIndex].name,
              message: trimmed,
              role: "me"
            };
            const event: EventChat = {
              type: "chat",
              sender: judge.myPlayerIndex,
              message: message,
            };
            if (judge.isServer()) { judge.sendEvent(event, sendToAll); }
            else { judge.sendEventToServer(event); }
            setChatMessages([...chatMessages, newMessage]);
          }}
        />
      </Box>
    );
  }

  // region final render
  return (
    <Box>
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          display: "flex",
          position: "relative",
          height: `${canvasHeight}px`,
          transition: "height 0.3s ease",
        }}
        onMouseDown={handleMouseDownCanvas}
        onMouseMove={handleMouseMoveCanvas}
        onMouseUp={handleMouseUpCanvas}
      >
        {judge.state === GameJudgeState.SelectingCards && 
          <Slider
            aria-label="Card Selection Slider"
            value={cardSelectionSliderValue}
            onChange={(event, newValue) => {
              setCardSelectionSliderValue(newValue as number);
            }}
            min={0}
            max={1}
            step={0.001}
            sx={{
              position: "absolute",
              left: `${deckLeft}px`,
              top: `${middleBarTop + cardHeight + canvasSpacing + 16}px`,
              width: `${deckWidth}px`,
              zIndex: 500,
              transition: "opacity 0.3s ease, width 0.3s ease, left 0.3s ease, top 0.3s ease",
            }}
          />
        }
        {Array.from(cards.values()).map((cardProps, _index) => {
          const elementKey = `${cardProps.cardInfo.characterId}-${cardProps.cardInfo.cardIndex}`;
          return <CharacterCard
            key={elementKey}
            cardCollection={data.cardCollection}
            paperVariant="elevation"
            imageSource={cardProps.source}
            width={cardProps.width}
            backgroundState={cardProps.backgroundState}
            upsideDown={cardProps.upsideDown}
            sx={{
              position: "absolute",
              left: cardProps.x,
              top: cardProps.y,
              zIndex: cardProps.zIndex,
              transition: cardProps.transition ?? getCardTransitionString("0.3s")
            }}
            onMouseEnter={cardProps.onMouseEnter}
            onMouseLeave={cardProps.onMouseLeave}
            onClick={cardProps.onClick}
          />
        })}
        {placeholderCards.map((pos, index) => {
          const elementKey = `placeholder-${index}`;
          return <CharacterCard
            key={elementKey}
            cardCollection={data.cardCollection}
            paperVariant="outlined"
            imageSource={""}
            width={`${cardWidth}px`}
            backgroundState={CardBackgroundState.Placeholder}
            sx={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              opacity: pos.hidden ? 0.0 : 1.0,
              transition: "opacity 0.3s ease, top 0.3s ease, left 0.3s ease, width 0.3s ease",
            }}
          />
        })}
        <Typography
          sx={{
            position: "absolute",
            left: `${canvasMargin}px`,
            top: `${unusedCardsBottom + canvasSpacing}px`,
            transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
            opacity: unusedCards.length > 0 ? 1.0 : 0.0,
            fontFamily: NoFontFamily,
            userSelect: "none",
          }}
        >
          {GetLocalizedString(Localization.GameUnusedCards)}
        </Typography>

        {otherElements.map((element) => element)}

      </Box>
    </Box>
  )
}