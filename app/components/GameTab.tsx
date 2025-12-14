import { Box, Button, Paper, Slider, Stack, TextField, Typography } from "@mui/material";
import { 
  CharacterId, 
  getMusicInfoFromCharacterId, GlobalData, 
  MusicSelectionMap, Playback, PlaybackSetting,
  PlaybackState, CardAspectRatio
} from "../types/Configs";
import { useState, useEffect, JSX, useRef } from "react";
import { 
  CardInfo, GameJudge, GameJudgeState, OpponentType, OuterRefObject, 
  PickEvent, Player, DeckPosition, GamePeer,
  Event
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
    notifyOuterEventHandler: (_event: Event) => {},
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
  const hasOpponent = judge.opponentType !== OpponentType.None;
  const isRemotePlayerOpponent = judge.opponentType === OpponentType.RemotePlayer;
  const isServer = !isRemotePlayerOpponent || judge.isServer;
  const isClient = isRemotePlayerOpponent && !judge.isServer;
  const playerNameHeight = isRemotePlayerOpponent ? 32 : 0;
  const opponentCollectedTop = canvasMargin;
  let opponentDeckTop = canvasMargin + playerNameHeight;
  if (hasOpponent && judge.state !== GameJudgeState.SelectingCards) {
    opponentDeckTop = canvasMargin + cardHeight + canvasSpacing + playerNameHeight + 16;
  }
  const deckColumns = judge.deckColumns; const deckRows = judge.deckRows;
  const deckWidth = deckColumns * cardWidth + (deckColumns - 1) * canvasSpacing;
  const deckHeight = deckRows * cardHeight + (deckRows - 1) * canvasSpacing;
  const opponentDeckBottom = opponentDeckTop + (hasOpponent ? deckHeight : 0);
  const deckLeft = (canvasWidth - deckWidth) / 2;
  const deckRight = deckLeft + deckWidth;
  const sliderHeight = 28;
  const middleBarTop = opponentDeckBottom + (hasOpponent ? canvasSpacing : 0);
  let middleBarHeight = 0;
  if (judge.state === GameJudgeState.SelectingCards) {
    middleBarHeight = 16 + cardHeight + canvasSpacing + sliderHeight;
  } else {
    middleBarHeight = 80;
  }
  const middleBarBottom = middleBarTop + middleBarHeight;
  const playerDeckTop = middleBarBottom + canvasSpacing;
  const playerDeckBottom = playerDeckTop + deckHeight;
  const playerCollectedTop = playerDeckBottom + canvasSpacing + playerNameHeight + canvasSpacing + 16;
  let canvasHeight = playerDeckBottom;
  if (judge.state !== GameJudgeState.SelectingCards) {
    canvasHeight = playerCollectedTop + cardHeight + canvasMargin;
  } else {
    canvasHeight = playerDeckBottom + canvasMargin;
  }
  const cardSelectionOverlap = cardWidth * 0.3;

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

  judge.deck.forEach((d) => {
    d.forEach((cardInfo) => {
      cardInsideDeck.add(cardInfo.toKey());
      if (cardInfo.characterId !== null) {
        characterInsideDeck.add(cardInfo.characterId);
      }
    })
  });
  judge.collectedCards.forEach((c) => {
    c.forEach((cardInfo) => {
      cardInsideCollected.add(cardInfo.toKey());
    });
  });

  peer.resetListener(judge.remoteEventListener.bind(judge));
  peer.notifyDisconnected = () => {
    judge.state = GameJudgeState.SelectingCards;
    judge.stopGame();
    setJudge(judge.reconstruct());
    setDragInfo(null);
    setHoveringCardInfo(null);
    notifyGameEnd();
    addSystemChatMessage(GetLocalizedString(Localization.ChatMessageDisconnected));
  }
  peer.notifyConnected = (peer: GamePeer) => {
    if (isRemotePlayerOpponent && isServer) {
      peer.sendEvent({
        type: "syncSettings",
        traditionalMode: judge.traditionalMode,
        randomStartPosition: playbackSetting.randomStartPosition,
        playbackDuration: playbackSetting.playbackDuration,
        deckColumns: judge.deckColumns,
        deckRows: judge.deckRows,
      })
      judge.resetGameState();
      setJudge(judge.reconstruct());
    } 
    addSystemChatMessage(GetLocalizedString(Localization.ChatMessageConnected));
    peer.sendEvent({
      type: "notifyName",
      name: judge.myName
    })
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

  const canvasPositionToDeckPosition = (x: number, y: number, allowedDecks: Array<number> = [0, 1]): DeckPosition | null => {
    for (const deckIndex of allowedDecks as (0 | 1)[]) {
      if (judge.opponentType === OpponentType.None && deckIndex === 1) {
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
    judge.resetOpponentDeck();
    setJudge(judge.reconstruct());
  }

  const sendEvent = (event: Event) => {
    if (judge.hasRemotePlayer() && peer.hasDataConnection()) {
      peer.sendEvent(event);
    }
  }

  // region outer event handler
  const outerEventHandler = (event: Event) => {
    switch (event.type) {
      case "pauseMusic": {
        notifyPauseMusic();
        break;
      }
      case "resumeMusic": {
        notifyPlayMusic();
        break;
      }
      case "syncSettings": {
        setPlaybackSetting({
          ...playbackSetting,
          randomStartPosition: event.randomStartPosition,
          playbackDuration: event.playbackDuration,
        });
        break;
      }
      case "chat": {
        const newMessage: ChatMessage = {
          role: "peer",
          sender: judge.opponentName,
          message: event.message,
        }
        setChatMessages((messages) => [...messages, newMessage]);
        break;
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
        // default:
        //   setTimerState((timerState) => ({ ...timerState })); // trigger re-render
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
    judge.deck.forEach((deck, deckIndex) => {
      deck.forEach((cardInfo, _cardIndex) => {
        if (cardInfo.characterId !== null && !inPlayingOrder.has(cardInfo.characterId)) {
          judge.removeFromDeck(deckIndex as 0 | 1, cardInfo, true);
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
    if (judge.myName !== "Player") {
      localStorage.setItem("myName", judge.myName);
    }
  }, [judge.myName])

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
      judge.myName = storedName;
      setJudge(judge => judge.reconstruct());
    }
    // load game setting from local storage
    const storedSetting = localStorage.getItem("gameSetting");
    if (storedSetting) {
      try {
        const settingObj = JSON.parse(storedSetting);
        if (typeof settingObj.cardWidthPercentage === "number") {
          setCardWidthPercentage(settingObj.cardWidthPercentage);
          console.log("Loaded card width percentage:", settingObj.cardWidthPercentage);
        }
        if (typeof settingObj.deckRows === "number" && settingObj.deckRows >= 1 && settingObj.deckRows <= maxDeckRows) {
          judge.deckRows = settingObj.deckRows;
          console.log("Loaded deck rows:", settingObj.deckRows);
        }
        if (typeof settingObj.deckColumns === "number" && settingObj.deckColumns >= 1 && settingObj.deckColumns <= maxDeckColumns) {
          judge.deckColumns = settingObj.deckColumns;
          console.log("Loaded deck columns:", settingObj.deckColumns);
        }
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

  judge.deck.forEach((deck, di) => {
    const deckIndex = di as 0 | 1;
    if (deckIndex === 1 && judge.opponentType === OpponentType.None) {
      return;
    }
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
          ...toDeckCardPosition(deckIndex, index),
          hidden: placeholderHidden
        });
      }
      if (cardInfo.characterId !== null) {
        const cardKey = cardInfo.toKey();
        const cardProps = cards.get(cardKey);
        if (cardProps === undefined) return;
        const pos = toDeckCardPosition(deckIndex, index);
        cardProps.x = pos.x;
        cardProps.y = pos.y;
        cardProps.zIndex = 200;
        if (deckIndex === 1) { cardProps.upsideDown = true; }
        if (judge.state === GameJudgeState.SelectingCards) {
          cardProps.onMouseEnter = () => {
            setHoveringCardInfo(cardInfo);
          };
          cardProps.onMouseLeave = () => {
            setHoveringCardInfo(null);
          };
        }
        if (judge.state === GameJudgeState.TurnStart) {
          cardProps.onClick = () => {
            judge.notifyPickEvent(new PickEvent(
              Date.now(), 0, cardInfo
            ), true);
            setJudge(judge.reconstruct());
          };
        }
        if (deckIndex == 0 && judge.state !== GameJudgeState.SelectingCards && judge.givesLeft > 0) {
          cardProps.onMouseEnter = () => {
            setHoveringCardInfo(cardInfo);
          };
          cardProps.onMouseLeave = () => {
            setHoveringCardInfo(null);
          };
        }
      }
    });
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
      cardProps.onMouseEnter = () => {
        setHoveringCardInfo(cardInfo);
      };
      cardProps.onMouseLeave = () => {
        setHoveringCardInfo(null);
      };
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

  if (judge.state !== GameJudgeState.SelectingCards) {
    judge.collectedCards.forEach((d, playerId) => {
      if (playerId === 1 && judge.opponentType === OpponentType.None) { return; }
      const y = (playerId === 0) ? playerCollectedTop : opponentCollectedTop;
      const startX = (playerId === 0) ? (canvasWidth - canvasMargin - cardWidth * 2 - canvasSpacing) : (canvasMargin + cardWidth + canvasSpacing);
      // add a text element
      {
        const textLeft = (playerId === 0) ? (canvasWidth - canvasMargin - cardWidth) : canvasMargin;
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
      if (d.length === 0) { return; }
      const totalWidth = canvasWidth - canvasMargin * 2 - cardWidth * 2 - canvasSpacing;
      let delta = d.length === 1 ? 0 : totalWidth / (d.length - 1);
      if (delta > cardWidth * 0.66) { delta = cardWidth * 0.66; }
      if (playerId === 0) {delta = -delta;}
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
        if (playerId === 1) {
          cardProps.upsideDown = true;
        }
        if (hoveringCardInfo !== null && hoveringCardInfo.toKey() === cardInfo.toKey()) {
          cardProps.y += (playerId === 0) ? -16 : 16;
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
      (!hasOpponent || isRemotePlayerOpponent) ? [0] : [0, 1]
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
    if (judge.givesLeft > 0) {canDrop.push(1);}
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
        } else {
          // only if gives>0 and opponent slot is empty
          const isEmptySlot = judge.deck[1][deckPos.cardIndex].characterId === null;
          if (judge.givesLeft > 0 && isEmptySlot) {
            canDrop = true;
          }
        }
      }
      if (canDrop && deckPos !== null) {
        // check opponent place is empty
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

  let unusedTotalWidth = (canvasWidth - deckWidth) / 2 - canvasSpacing - canvasMargin;
  if (unusedTotalWidth - cardWidth > 50) {
    unusedTotalWidth = 50 + cardWidth;
  }
  let unusedD = 0;
  if (unusedTotalWidth > cardWidth) {
    unusedD = (unusedTotalWidth - cardWidth) / (unusedCards.length - 1);
  }
  const unusedCardsBottom = playerDeckTop + deckHeight;
  if (unusedD > 4) { unusedD = 5; }
  unusedCards.forEach((cardInfo, index) => {
    const cardKey = cardInfo.toKey();
    const cardProps = cards.get(cardKey);
    if (cardProps === undefined) return;
    cardProps.x = canvasMargin + unusedD * index;
    cardProps.y = playerDeckTop + deckHeight - cardHeight - unusedD * index;
    cardProps.zIndex = index;
  });

  // region handlers

  const handleMouseDownCanvas = (event: React.MouseEvent) => {
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
      if (judge.opponentType === OpponentType.RemotePlayer && deckPos !== null && deckPos.deckIndex === 1) {
        deckPos = null; // when there is a remote opponent, cannot move cards from opponent's side.
      }
      if (deckPos !== null) {
        const cardInfo = judge.getDeck(deckPos.deckIndex, deckPos.cardIndex);
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
        const cardInfo = judge.getDeck(deckPos.deckIndex, deckPos.cardIndex);
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
        (!hasOpponent || isRemotePlayerOpponent) ? [0] : [0, 1]
      );
      if (seeAsClick) {
        if (dragInfo.dragType === "fromSelectable") {
          // add to deck at first empty slot
          if (deckPos === null) {
            for (let i = 0; i < judge.deckRows * judge.deckColumns; i++) {
              const already = judge.getDeck(0, i);
              if (already === null) {
                deckPos = { deckIndex: 0, cardIndex: i };
                break;
              }
            }
            if (deckPos === null && hasOpponent && !isRemotePlayerOpponent) {
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
      if (deckPos !== null) {
        // if from deck, remove first
        if (dragInfo.dragType === "fromDeck") {
          judge.removeFromDeck(dragInfo.dragFromDeck!.deckIndex, dragInfo.cardInfo, true);
        }
        // check if already have, remove it first
        const already = judge.getDeck(deckPos.deckIndex, deckPos.cardIndex);
        if (already !== null) {
          judge.removeFromDeck(deckPos.deckIndex, already, true);
          if (dragInfo.dragType === "fromDeck") {
            // swap
            judge.addToDeck(dragInfo.dragFromDeck!.deckIndex, already, dragInfo.dragFromDeck!.cardIndex, true);
          }
        }
        // add to deck
        judge.addToDeck(deckPos.deckIndex, dragInfo.cardInfo, deckPos.cardIndex, true);
        setJudge(judge.reconstruct());
      } else {
        if (dragInfo.dragType === "fromDeck") {
          // remove from deck
          judge.removeFromDeck(dragInfo.dragFromDeck!.deckIndex, dragInfo.cardInfo, true);
          setJudge(judge.reconstruct());
        }
      }
      setDragInfo(null);
    } else if (judge.state === GameJudgeState.TurnWinnerDetermined) {
      const canDrop = [0];
      if (judge.givesLeft > 0) {canDrop.push(1);}
      let deckPos = canvasPositionToDeckPosition(
        mouseX,
        mouseY,
        canDrop
      );
      if (seeAsClick && judge.givesLeft > 0 && (
        deckPos === null || (deckPos.deckIndex === 0 && deckPos.cardIndex === dragInfo.dragFromDeck!.cardIndex)
      )) {
        // find the first place empty in opponent deck as deckPos
        for (let i = 0; i < judge.deckRows * judge.deckColumns; i++) {
          const already = judge.getDeck(1, i);
          if (already === null) {
            deckPos = { deckIndex: 1, cardIndex: i };
            break;
          }
        }
      }
      if (deckPos !== null && deckPos.deckIndex === 1) {
        // if deckpos is not empty, set it to null
        if (deckPos !== null) {
          if (judge.getDeck(1, deckPos.cardIndex) !== null) {
            deckPos = null;
          }
        }
      }
      // put to there
      if (deckPos !== null) {
        if (deckPos.deckIndex === 0) {
          // swap self cards
          const already = judge.getDeck(0, deckPos.cardIndex);
          if (already !== null) {
            judge.removeFromDeck(0, already, true);
            judge.addToDeck(dragInfo.dragFromDeck!.deckIndex, already, dragInfo.dragFromDeck!.cardIndex, true);
          }
          judge.removeFromDeck(0, dragInfo.cardInfo, true);
          judge.addToDeck(0, dragInfo.cardInfo, deckPos.cardIndex, true);
        } else {
          // give
          judge.removeFromDeck(0, dragInfo.cardInfo, true);
          judge.addToDeck(1, dragInfo.cardInfo, deckPos.cardIndex, true);
          judge.givesLeft -= 1;
          sendEvent({ type: "give" });
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
    judge.adjustDeckSize(judge.deckRows + 1, judge.deckColumns, true);
    setJudge(judge.reconstruct());
  }

  const removeDeckRow = () => {
    if (judge.deckRows <= 1) return;
    judge.adjustDeckSize(judge.deckRows - 1, judge.deckColumns, true);
    setJudge(judge.reconstruct());
  }

  const addDeckColumn = () => {
    if (judge.deckColumns >= maxDeckColumns) return;
    judge.adjustDeckSize(judge.deckRows, judge.deckColumns + 1, true);
    setJudge(judge.reconstruct());
  }

  const removeDeckColumn = () => {
    if (judge.deckColumns <= 1) return;
    judge.adjustDeckSize(judge.deckRows, judge.deckColumns - 1, true);
    setJudge(judge.reconstruct());
  }

  const canStartGame = () => {
    if (judge.state !== GameJudgeState.SelectingCards) return false;
    if (judge.isDeckEmpty(0)) return false;
    if (hasOpponent && judge.isDeckEmpty(1)) return false;
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
    judge.confirmStart(0);
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
      console.log("CPU opponent picking card");
      const judge = judgeRef.current;
      if (judge.opponentType === OpponentType.CPU && judge.state === GameJudgeState.TurnStart) {
        judge.simulateCPUOpponentPick(shouldMistake);
        setJudge(judge.reconstruct());
      }
    }, delay * 1000);
    setCpuOpponentClickTimeout(timeout);
  }

  const handleNextTurnCountdown = () => {
    console.log("Next turn notified");
    if (judge.opponentType === OpponentType.RemotePlayer) {
      notifyPlayCountdownAudio();
      timerTextStartCountdown();
    }
  }
  outerRef.current.notifyNextTurnCountdown = handleNextTurnCountdown;

  const handleNextTurnButtonClick = () => {
    if (judge.state === GameJudgeState.TurnWinnerDetermined && judge.givesLeft > 0) {
      judge.giveCardsRandomly(true);
      setJudge(judge.reconstruct());
      return;
    }
    if (judge.opponentType === OpponentType.CPU && judge.givesLeft < 0) {
      judge.giveCardsRandomly(false);
    }
    judge.confirmNext(0);
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
    if (judge.opponentType === OpponentType.CPU) {
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
    sendEvent({ type: "resumeMusic" });
  }

  const handlePauseMusicButtonPressed = () => {
    notifyPauseMusic();
    sendEvent({ type: "pauseMusic" });
  }

  const handlePeerError = (error: string) => {
    setPeerError(error);
  }
  peer.notifyPeerError = handlePeerError;

  // const handleAddDeck

  // region render
  const buttonSize = 36;

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
      )
      const disabled = judge.isMusicFilteredByDeck();
      otherElements.push(
        <GameButton 
          key="filter-by-deck-button"
          text={GetLocalizedString(Localization.GameFilterByDeck)}
          onClick={() => {
            judge.filterMusicByDeck();
            if (isRemotePlayerOpponent) {
              sendEvent({ type: "filterMusicByDeck" });
            }
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
      const isStopGameButton = judge.state !== GameJudgeState.SelectingCards;
      let disabled = (!isStopGameButton && !canStartGame()) || (isClient && judge.clientWaitAcknowledge);
      const contained = (
        !isStopGameButton &&
        judge.state === GameJudgeState.SelectingCards &&
        isRemotePlayerOpponent &&
        judge.confirmations.start.one()
      )
      let text = (isStopGameButton 
        ? GetLocalizedString(Localization.GameStop) 
        : GetLocalizedString(Localization.GameStart)
      );
      if (contained) {
        if (judge.confirmations.start.ok[0]) {
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
      y += buttonSize + canvasSpacing;
    }
    { // random fill button
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      const disabled = judge.deck[0].every((c) => c.characterId !== null);
      otherElements.push(
        <GameButton 
          key="random-fill-button"
          text={GetLocalizedString(Localization.GameRandomFill)}
          onClick={() => {
            judge.randomFillDeck(0, true);
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
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      const disabled = judge.deck[0].every((c) => c.characterId === null);
      otherElements.push(
        <GameButton 
          key="clear-deck-button"
          text={GetLocalizedString(Localization.GameClearDeck)}
          onClick={() => {
            judge.clearDeck(0, true);
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
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      const disabled = judge.deck[0].every((c) => c.characterId === null);
      otherElements.push(
        <GameButton 
          key="shuffle-deck-button"
          text={GetLocalizedString(Localization.GameShuffleDeck)}
          onClick={() => {
            judge.shuffleDeck(0, true);
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
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      let text = "";
      if (judge.opponentType === OpponentType.None) { 
        text = GetLocalizedString(Localization.GameOpponentNoOpponent);
      }
      else if (judge.opponentType === OpponentType.CPU) { 
        text = GetLocalizedString(Localization.GameOpponentCPUOpponent); 
      }
      else {
        if (judge.isServer) { text = GetLocalizedString(Localization.GameOpponentRemoteAsServer); }
        else { text = GetLocalizedString(Localization.GameOpponentRemoteAsClient); }
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
            if (judge.opponentType === OpponentType.None) {
              judge.opponentType = OpponentType.CPU;
              resetOpponentDeck();
            } else if (judge.opponentType === OpponentType.CPU) {
              judge.opponentType = OpponentType.RemotePlayer;
              judge.isServer = true;
              peer.ensurePeerNotNull();
              disconnectWebRTCIfAny();
              resetOpponentDeck();
            } else if (judge.opponentType === OpponentType.RemotePlayer) {
              if (judge.isServer) {
                judge.isServer = false;
                peer.ensurePeerNotNull();
                disconnectWebRTCIfAny();
                resetOpponentDeck();
              } else {
                judge.opponentType = OpponentType.None;
                disconnectWebRTCIfAny();
                resetOpponentDeck();
              }
            }
            setJudge(judge.reconstruct());
          }}  
        >
          {judge.opponentType === OpponentType.None && <PersonOffRounded></PersonOffRounded>}
          {judge.opponentType === OpponentType.CPU && <SmartToyRounded></SmartToyRounded>}
          {judge.opponentType === OpponentType.RemotePlayer && <GroupsRounded></GroupsRounded>}
        </GameButton>
      );
      if (!hidden) y += buttonSize + canvasSpacing;
    }
    { // remove row button
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      const normalY = playerDeckTop + deckHeight - buttonSize * 2 - canvasSpacing;
      if (normalY > y) { y = normalY; }
      otherElements.push(
        <GameButton 
          key="remove-deck-row-button"
          onClick={removeDeckRow}
          disabled={judge.deckRows <= 1}
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
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      otherElements.push(
        <GameButton 
          key="add-deck-row-button"
          onClick={addDeckRow}
          disabled={judge.deckRows >= maxDeckRows}
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
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      otherElements.push(
        <GameButton 
          key="add-deck-column-button"
          onClick={addDeckColumn}
          disabled={judge.deckColumns >= maxDeckColumns}
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
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      otherElements.push(
        <GameButton 
          key="remove-deck-column-button"
          onClick={removeDeckColumn}
          disabled={judge.deckColumns <= 1}
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
        <Typography variant="h3" fontFamily={MonospaceFontFamily}>{text}</Typography> 
      </Box>
      );
      x += timerTextWidth + canvasSpacing;
    }
    { // text are intentionally set no opacity transition to avoid hinting the player of the correct answer
      const musicInfo = getMusicInfoFromCharacterId(data, musicSelection, currentCharacterId);
      const hidden = judge.state !== GameJudgeState.TurnWinnerDetermined;
      const width = deckWidth - (timerTextWidth + 3 * canvasSpacing + buttonSize * 2);
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
      otherElements.push(
        <GameButton 
          key="play-pause-button"
          disabled={isDisabled}
          hidden={!middleBarShown}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${buttonY}px`,
            opacity: middleBarShown ? 1.0 : 0.0,
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
        isRemotePlayerOpponent &&
        judge.confirmations.next.one()
      );
      let icon = "skip"
      let text = "";
      if (contained) {
        if (judge.confirmations.next.ok[1]) {
          text = GetLocalizedString(Localization.GameNextTurnOpponentWaiting);
        } else {
          text = GetLocalizedString(Localization.GameNextTurnWaitingForOpponent);
          clickable = false;
        }
      }
      if (judge.state === GameJudgeState.TurnWinnerDetermined && judge.givesLeft > 0) {
        text = GetLocalizedString(Localization.GameNextTurnGiveCards, new Map<string, string>([
          ["givesLeft", judge.givesLeft.toString()],
          ["plural", judge.givesLeft > 1 ? "s" : ""],
        ]));
        icon = "shuffle";
      }
      if (judge.state === GameJudgeState.TurnWinnerDetermined && judge.givesLeft < 0 && judge.hasRemotePlayer()) {
        text = GetLocalizedString(Localization.GameNextTurnReceiveCards, new Map<string, string>([
          ["receives", (-judge.givesLeft).toString()],
          ["plural", -judge.givesLeft > 1 ? "s" : ""],
        ]));
        clickable = false;
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
      otherElements.push(
        <GameButton
          key="next-turn-button"
          disabled={!clickable}
          hidden={!middleBarShown}
          text={text}
          sx={{
            position: "absolute", left: `${x}px`, top: `${buttonY}px`,
            opacity: middleBarShown ? 1.0 : 0.0,
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
        if (judge.givesLeft > 0) {
          text = GetLocalizedString(Localization.GameInstructionGiveCards, new Map<string, string>([
            ["givesLeft", judge.givesLeft.toString()],
            ["plural", judge.givesLeft > 1 ? "s" : ""],
          ]));
        } else if (judge.givesLeft < 0 && judge.hasRemotePlayer()) {
          text = GetLocalizedString(Localization.GameInstructionReceiveCards, new Map<string, string>([
            ["receives", (-judge.givesLeft).toString()],
            ["plural", -judge.givesLeft > 1 ? "s" : ""],
          ]));
          clickable = false;
        } else if (judge.givesLeft < 0 && !judge.hasRemotePlayer()) {
          text = GetLocalizedString(Localization.GameInstructionReceiveCardsCPU, new Map<string, string>([
            ["receives", (-judge.givesLeft).toString()],
            ["plural", -judge.givesLeft > 1 ? "s" : ""],
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
    if (judge.opponentType === OpponentType.RemotePlayer && !peer.hasDataConnection()) {
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
              value={judge.myName}
              onChange={(e) => {
                judge.myName = e.target.value;
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
              {isServer 
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
              value={isServer ? (peer.peer?.id ?? GetLocalizedString(Localization.GameConnectionGeneratingId)) : remotePlayerIdInput}
              onChange={(e) => {
                setRemotePlayerIdInput(e.target.value);
              }}
            />
            {!isServer && <Button
              onClick={() => {
                peer.connectToPeer(remotePlayerIdInput);
              }}
              sx={{fontFamily: NoFontFamily}}
              variant="outlined"
            >
              {GetLocalizedString(Localization.GameConnectionConnect)}
            </Button>}
            {isServer && <Stack
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
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.opponentType === OpponentType.None;
      otherElements.push(
        <GameButton
          key="opponent-traditional-mode-button"
          hidden={hidden}
          text={judge.traditionalMode 
            ? GetLocalizedString(Localization.GameModeTraditional) 
            : GetLocalizedString(Localization.GameModeNonTraditional)}
          onClick={() => {
            judge.traditionalMode = !judge.traditionalMode;
            sendEvent({
              type: "switchTraditionalMode",
              traditionalMode: judge.traditionalMode,
            })
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
      const hidden = judge.state !== GameJudgeState.SelectingCards;
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
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.opponentType !== OpponentType.CPU;
      const disabled = judge.deck[1].every((c) => c.characterId === null);
      otherElements.push(
        <GameButton
          key="shuffle-opponent-deck-button"
          disabled={disabled}
          hidden={hidden}
          text={GetLocalizedString(Localization.GameShuffleDeck)}
          onClick={() => {
            judge.shuffleDeck(1, true);
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
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.opponentType !== OpponentType.CPU;
      const disabled = judge.deck[1].every((c) => c.characterId === null);
      otherElements.push(
        <GameButton
          key="clear-opponent-deck-button"
          disabled={disabled}
          hidden={hidden}
          text={GetLocalizedString(Localization.GameClearDeck)}
          onClick={() => {
            judge.clearDeck(1, true);
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
      const hidden = judge.state !== GameJudgeState.SelectingCards || judge.opponentType !== OpponentType.CPU;
      const disabled = judge.deck[1].every((c) => c.characterId !== null);
      otherElements.push(
        <GameButton
          key="random-fill-opponent-deck-button"
          disabled={disabled}
          hidden={hidden}
          text={GetLocalizedString(Localization.GameRandomFill)}
          onClick={() => {
            judge.randomFillDeck(1, true);
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
      judge.opponentType === OpponentType.CPU
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

  // player names
  {
    { // self name
      const shown = isRemotePlayerOpponent;
      let y = playerDeckBottom;
      if (judge.state === GameJudgeState.SelectingCards) {
        y += canvasMargin + buttonSize + canvasSpacing;
      } else {
        y += canvasSpacing;
      }
      let x = canvasWidth - deckLeft - deckWidth;
      if (judge.state !== GameJudgeState.SelectingCards) {
        x = canvasMargin;
      }
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
          }}
        >
          {GetLocalizedString(Localization.GamePlayer)} {judge.myName}
        </Typography>
      );
      if (y + playerNameHeight + canvasMargin > canvasHeight) {
        canvasHeight = y + playerNameHeight + canvasMargin;
      }
    }
    { // opponent name
      const shown = isRemotePlayerOpponent && peer.hasDataConnection();
      const y = opponentDeckTop - playerNameHeight - canvasSpacing;
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
          }}
        >
          {GetLocalizedString(Localization.GameOpponent)} {judge.opponentName}
        </Typography>
      );
    }
  }

  // chat messages box
  // region chat box
  {
    const width = deckLeft - canvasMargin - 40;
    const y = playerDeckBottom;
    const x = canvasMargin;
    const shown = isRemotePlayerOpponent;
    otherElements.push(
      <Box
        key="chat-messages-box"
        sx={{
          position: "absolute",
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${deckHeight}px`,
          transform: `translateY(-100%)`,
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
              sender: judge.myName,
              message: trimmed,
              role: "me"
            };
            sendEvent({
              type: "chat",
              message: message,
            });
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
          }}
        >
          {GetLocalizedString(Localization.GameUnusedCards)}
        </Typography>

        {otherElements.map((element) => element)}

      </Box>
    </Box>
  )
}