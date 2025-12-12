import { Box, Button, Grid, Slider, Stack, TextField, Typography } from "@mui/material";
import { 
  CharacterId, createPlayingOrder, 
  getMusicInfoFromCharacterId, GlobalData, 
  MusicSelectionMap, Playback, PlaybackSetting,
  PlaybackState, CardAspectRatio
} from "../types/Configs";
import { useState, useEffect, JSX, useRef } from "react";
import { 
  CardInfo, GameJudge, GameJudgeState, OpponentType, OuterRefObject, 
  PickEvent, Player, DeckPosition, GamePeer
} from "../types/GameJudge";
import { CardBackgroundState, CharacterCard } from "./CharacterCard";
import {
  SkipNextRounded, PauseRounded, PlayArrowRounded, EastRounded, WestRounded,
  StopRounded, GroupsRounded, SmartToyRounded, PersonOffRounded,
  AddRounded, RemoveRounded
} from "@mui/icons-material";
import { GameButton } from "./GameTabControls";


export interface GameTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  playingOrder: Array<CharacterId>;
  playback: Playback,
  playbackState: PlaybackState,
  notifyGameStart: (order: Array<CharacterId> | null) => Array<CharacterId>;
  notifyPauseMusic: () => void;
  notifyPlayMusic: () => void;
  notifyPlayCountdownAudio: () => void;
  setCurrentCharacterId: (characterId: CharacterId) => void;
  setPlayingOrder: (order: Array<CharacterId>) => void;
  setCharacterTemporaryDisabled: (map: Map<CharacterId, boolean>) => void;
  setMusicSelection: (map: MusicSelectionMap) => void;
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

function getCardTransitionString(duration: string): string {
  return `top ${duration}, left ${duration}, transform ${duration}, background-color ${duration}, width ${duration}, height ${duration}`;
}

export default function GameTab({
  data, 
  musicSelection,
  currentCharacterId, 
  characterTemporaryDisabled,
  playingOrder,
  playback,
  playbackState,
  notifyGameStart,
  notifyPauseMusic,
  notifyPlayMusic,
  notifyPlayCountdownAudio,
  setCurrentCharacterId,
  setPlayingOrder,
  setCharacterTemporaryDisabled,
  setMusicSelection,
}: GameTabProps) {

  // region states
  const [, setForceRerender] = useState<{}>({}); // used to force re-render
  const peerRef = useRef<GamePeer>(new GamePeer());
  const peer = peerRef.current;
  peer.refresh = () => { setForceRerender({}); };
  const outerRef = useRef<OuterRefObject>({
    playingOrder: playingOrder,
    characterTemporaryDisabled: characterTemporaryDisabled,
    currentCharacterId: currentCharacterId,
    musicSelection: musicSelection,
    setCurrentCharacterId: setCurrentCharacterId,
    setPlayingOrder: setPlayingOrder,
    setCharacterTemporaryDisabled: setCharacterTemporaryDisabled,
    setMusicSelection: setMusicSelection,
    notifyTurnWinnerDetermined: (winner: Player | null) => {},
    notifyTurnStarted: (characterId: CharacterId) => {},
    peer: peer,
    notifyStartGame: () => { return new Array<CharacterId>(); },
    notifyNextTurn: () => {},
    refresh: (judge: GameJudge) => { setJudge(judge.reconstruct()); },
  });
  const [judge, setJudge] = useState<GameJudge>(new GameJudge(outerRef));
  const [cardWidthPercentage, setCardWidthPercentage] = useState<number>(0.08);
  const [cardSelectionSliderValue, setCardSelectionSliderValue] = useState<number>(0);
  const [unusedCards, setUnusedCards] = useState<CardInfo[]>([]);
  const [hoveringCardInfo, setHoveringCardInfo] = useState<CardInfo | null>(null);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [remotePlayerIdInput, setRemotePlayerIdInput] = useState<string>("");
  const [timerState, setTimerState] = useState<TimerState>({ 
    type: "zero", referenceTimestamp: 0, time: 0,
    intervalHandle: null
  });
  const forceRerender = (judge: GameJudge): void => { 
    console.log("force rerender");
    setJudge(judge.reconstruct());
  };
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
  const canvasWidth = (containerRef.current ? containerRef.current.clientWidth : 800) - canvasMargin * 2;
  const cardWidth = canvasWidth * cardWidthPercentage;
  const cardHeight = cardWidth / CardAspectRatio;
  const hasOpponent = judge.opponentType !== OpponentType.None;
  const isRemotePlayerOpponent = judge.opponentType === OpponentType.RemotePlayer;
  const isServer = !isRemotePlayerOpponent || judge.isServer;
  const isClient = isRemotePlayerOpponent && !judge.isServer;
  const opponentCollectedTop = canvasMargin;
  let opponentDeckTop = canvasMargin;
  if (hasOpponent && judge.state !== GameJudgeState.SelectingCards) {
    opponentDeckTop += cardHeight + canvasSpacing + canvasMargin;
  }
  const deckColumns = judge.deckColumns; const deckRows = judge.deckRows;
  const deckWidth = deckColumns * cardWidth + (deckColumns - 1) * canvasSpacing;
  const deckHeight = deckRows * cardHeight + (deckRows - 1) * canvasSpacing;
  const opponentDeckBottom = opponentDeckTop + (hasOpponent ? deckHeight : 0);
  const deckLeft = (canvasWidth - deckWidth) / 2;
  const deckRight = deckLeft + deckWidth;
  const sliderHeight = 28;
  let middleBarTop = opponentDeckBottom + (hasOpponent ? canvasSpacing : 0);
  let middleBarHeight = 0;
  if (judge.state === GameJudgeState.SelectingCards) {
    middleBarHeight = cardHeight + canvasSpacing + sliderHeight;
  } else {
    middleBarHeight = 80;
  }
  const middleBarBottom = middleBarTop + middleBarHeight;
  const playerDeckTop = middleBarBottom + canvasSpacing;
  const playerDeckBottom = playerDeckTop + deckHeight;
  const playerCollectedTop = playerDeckBottom + canvasSpacing + canvasMargin;
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
  const totalCardCount = cards.size;

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
    setForceRerender({});
  }
  
  // region utility funcs
  const characterIdToCardInfos = (characterId: CharacterId, except: number = -1): Array<CardInfo> => {
    const characterConfig = data.characterConfigs.get(characterId);
    const cardInfos: Array<CardInfo> = new Array<CardInfo>();
    if (characterConfig) {
      characterConfig.card.forEach((cardId, index) => {
        if (index === except) return;
        cardInfos.push(new CardInfo(characterId, index));
      });
    }
    return cardInfos;
  }

  const canvasPositionToDeckPosition = (x: number, y: number, allowedDecks: Array<number> = [0, 1]): DeckPosition | null => {
    for (let deckIndex of allowedDecks as (0 | 1)[]) {
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
    console.log("start countdown");
    setTimerState((timerState) => ({
      ...timerState,
      type: "countdown",
      referenceTimestamp: Date.now(),
      time: 0,
    }));
  }

  const timerTextStartRunning = () => {
    console.log("start running");
    setTimerState((timerState) => ({
      ...timerState,
      type: "running",
      referenceTimestamp: Date.now(),
      time: 0,
    }));
  }

  const timerTextPause = () => {
    console.log("pause timer");
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

  // region use effects

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
    outerRef.current.playingOrder = playingOrder;
    outerRef.current.characterTemporaryDisabled = characterTemporaryDisabled;
    outerRef.current.currentCharacterId = currentCharacterId;
    outerRef.current.musicSelection = musicSelection;
    outerRef.current.peer = peer;
    outerRef.current.setCurrentCharacterId = setCurrentCharacterId;
    outerRef.current.setPlayingOrder = setPlayingOrder;
    outerRef.current.setCharacterTemporaryDisabled = setCharacterTemporaryDisabled;
    outerRef.current.setMusicSelection = setMusicSelection;
  }, [
    playingOrder, 
    characterTemporaryDisabled, 
    currentCharacterId,
    musicSelection,
    peer,
    setCurrentCharacterId,
    setPlayingOrder,
    setCharacterTemporaryDisabled,
    setMusicSelection
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
      placeholderCards.push({
        ...toDeckCardPosition(deckIndex, index),
        hidden: cardInfo.characterId !== null
      });
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
      cardProps.y = middleBarTop;
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
           <Typography variant="h3" sx={{ userSelect: "none" }}>
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

  const unusedTotalWidth = (canvasWidth - deckWidth) / 2 - canvasSpacing - canvasMargin;
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
          judge.removeFromDeck(deckPos.deckIndex, cardInfo, true);
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
    if (dragInfo && dragInfo.dragging) {
      const currentTime = Date.now();
      // if mouse up too fast, see as a click
      let deckPos = canvasPositionToDeckPosition(
        mouseX,
        mouseY,
        // can drop to opponent deck if there is a opponent and it is not a remote player.
        (!hasOpponent || isRemotePlayerOpponent) ? [0] : [0, 1]
      );
      if (currentTime - dragInfo.mouseDownTimestamp < 100) {
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
      }
      setDragInfo(null);
    }
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

  const maxDeckRows = 5;
  const maxDeckColumns = 15;
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

  const handleNextTurn = () => {
    if (judge.opponentType === OpponentType.RemotePlayer) {
      notifyPlayCountdownAudio();
      timerTextStartCountdown();
    }
  }
  outerRef.current.notifyNextTurn = handleNextTurn;

  const handleNextTurnButtonClick = () => {
    judge.confirmNext(0);
    setJudge(judge.reconstruct());
  }

  const handleStopGameButtonClick = () => {
    judge.state = GameJudgeState.SelectingCards;
    judge.stopGame();
    setJudge(judge.reconstruct());
    setDragInfo(null);
    setHoveringCardInfo(null);
  }

  const notifyTurnStarted = () => {
    timerTextStartRunning();
  }
  outerRef.current.notifyTurnStarted = notifyTurnStarted;

  const notifyTurnWinnerDetermined = () => {
    timerTextPause();
  }
  outerRef.current.notifyTurnWinnerDetermined = notifyTurnWinnerDetermined;

  // const handleAddDeck

  // region render
  const buttonSize = 36;

  // region r - buttons
  
  // player deck right
  {
    let y = playerDeckTop;
    const x = deckRight + canvasMargin;
    { // card smaller button
      const disabled = cardWidthPercentage <= cardWidthPercentageMin;
      otherElements.push(
        <GameButton 
          key="card-smaller-button" 
          text="Card Smaller" 
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
      const disabled = cardWidthPercentage >= cardWidthPercentageMax;
      otherElements.push(
        <GameButton 
          key="card-larger-button" 
          text="Card Larger" 
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
    { // start button
      const isStopGameButton = judge.state !== GameJudgeState.SelectingCards;
      const disabled = (!isStopGameButton && !canStartGame()) || (isClient && judge.clientWaitAcknowledge);
      const contained = (
        !isStopGameButton &&
        judge.state === GameJudgeState.SelectingCards &&
        isRemotePlayerOpponent &&
        judge.confirmations.start.one()
      )
      otherElements.push(
        <GameButton 
          key="start-button"
          text="Start"
          disabled={disabled}
          onClick={isStopGameButton ? handleStopGameButtonClick : handleStartGameButtonClick}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${y}px`, 
          }}
          contained={contained}
        >
          {!isStopGameButton && <PlayArrowRounded></PlayArrowRounded>}
          {isStopGameButton && <StopRounded></StopRounded>}
        </GameButton>
      );
      y += buttonSize + canvasSpacing;
    }
    { // switch mode button
      const hidden = judge.state !== GameJudgeState.SelectingCards;
      let text = "";
      if (judge.opponentType === OpponentType.None) { text = "No opponent" }
      else if (judge.opponentType === OpponentType.CPU) { text = "CPU opponent" }
      else {
        if (judge.isServer) { text = "PvP (Server)" }
        else { text = "PvP (Client)" }
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
  }

  // player deck bottom
  {
    const y = playerDeckTop + deckHeight + canvasMargin;
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
            backgroundColor: "#ffeeee",
            opacity: middleBarShown ? 1.0 : 0.0,
            transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease, opacity 0.3s ease",
          }}
        >
        <Typography variant="h3">{text}</Typography> 
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
          }}
        >
          {musicInfo?.album}
        </Typography>
      );
      x = deckRight - buttonSize * 2 - canvasSpacing;
    }
    { // play/pause button
      const isPlay = playbackState !== PlaybackState.Playing;
      const isDisabled = playbackState === PlaybackState.CountingDown;
      const buttonY = y + middleBarHeight / 2 - buttonSize / 2;
      otherElements.push(
        <GameButton 
          key="play-pause-button"
          disabled={isDisabled}
          sx={{ 
            position: "absolute", left: `${x}px`, top: `${buttonY}px`,
            opacity: middleBarShown ? 1.0 : 0.0,
            transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
          }}
          onClick={
            isPlay ? notifyPlayMusic : notifyPauseMusic
          }
        >
          {isPlay && <PlayArrowRounded fontSize="large"></PlayArrowRounded>}
          {!isPlay && <PauseRounded fontSize="large"></PauseRounded>}
        </GameButton>
      );
      x += buttonSize + canvasSpacing;
    }
    { // next turn button
      const clickable = true;
      const buttonY = y + middleBarHeight / 2 - buttonSize / 2;
      otherElements.push(
        <GameButton
          key="next-turn-button"
          disabled={!clickable}
          sx={{
            position: "absolute", left: `${x}px`, top: `${buttonY}px`,
            opacity: middleBarShown ? 1.0 : 0.0,
            transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
          }}
          onClick={handleNextTurnButtonClick}
        >
          <SkipNextRounded fontSize="large"></SkipNextRounded>
        </GameButton>
      );
    }
  }

  { // opponent connection 
    const textHeight = 16;
    if (judge.opponentType === OpponentType.RemotePlayer && !peer.hasDataConnection()) {
      otherElements.push(
        <Stack
          key="opponent-connection-box"
          direction="column"
          spacing={1}
          padding={1}
          sx={{
            position: "absolute",
            left: `${deckLeft}px`,
            top: `${opponentDeckTop}px`,
            width: `${deckWidth}px`,
            height: `${deckHeight}px`,
            backgroundColor: "#ffeeee",
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
            zIndex: 1500
          }}
        >
          <Typography 
            variant="body1"
            sx={{
              textAlign: "left",
              height: `${textHeight}px`,
              width: "100%",
              paddingLeft: "4px",
            }}
          >
            {isServer ? "Share this code with the remote client player" : "Enter the code from the remote server player"}
          </Typography>
          <TextField
            size="small"
            multiline
            sx={{ 
              width: "100%",
            }}
            value={isServer ? (peer.peer?.id ?? "") : remotePlayerIdInput}
            
            onChange={(e) => {
              setRemotePlayerIdInput(e.target.value);
            }}
          />
          {!isServer && <Button
            onClick={() => {
              peer.connectToPeer(remotePlayerIdInput);
            }}
            variant="outlined"
          >
            Connect
          </Button>}
        </Stack>
      );
    }
  }

  return (
    <Box>
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          display: "flex",
          position: "relative",
          height: "100vh",
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
              top: `${middleBarTop + cardHeight + canvasSpacing}px`,
              width: `${deckWidth}px`,
              zIndex: 500,
              transition: "opacity 0.3s ease, width 0.3s ease, left 0.3s ease, top 0.3s ease",
            }}
          />
        }
        {Array.from(cards.values()).map((cardProps, index) => {
          const elementKey = `${cardProps.cardInfo.characterId}-${cardProps.cardInfo.cardIndex}`;
          return <CharacterCard
            key={elementKey}
            cardCollection={data.cardCollection}
            paperVariant="elevation"
            imageSource={cardProps.source}
            width={cardProps.width}
            backgroundState={cardProps.backgroundState}
            sx={{
              position: "absolute",
              left: cardProps.x,
              top: cardProps.y,
              zIndex: cardProps.zIndex,
              transition: cardProps.transition ?? getCardTransitionString("0.3s"),
              transform: cardProps.transform ?? (cardProps.upsideDown ? "rotate(180deg)" : "none"),
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
            transition: "opacity 0.3s ease",
            opacity: unusedCards.length > 0 ? 1.0 : 0.0,
          }}
        >
          Unused cards
        </Typography>

        {otherElements.map((element) => element)}

      </Box>
    </Box>
  )
}