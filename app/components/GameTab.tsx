import { Box, Button, Grid, Slider, Stack, TextField, Typography } from "@mui/material";
import { 
  CharacterId, createPlayingOrder, 
  getMusicInfoFromCharacterId, GlobalData, 
  MusicSelectionMap, Playback, PlaybackSetting,
  PlaybackState, CardAspectRatio
} from "../types/Configs";
import { useState, useEffect, JSX, useRef } from "react";
import { CardInfo, GameJudge, GameJudgeState, OpponentType } from "../types/GameJudge";
import { CardBackgroundState, CharacterCard } from "./CharacterCard";
import {
  SkipNextRounded, PlayArrowRounded
} from "@mui/icons-material";


export interface GameTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  playingOrder: Array<CharacterId>;
  setCurrentCharacterId: (characterId: CharacterId) => void;
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

function getCardTransitionString(duration: string): string {
  return `top ${duration}, left ${duration}, transform ${duration}, background-color ${duration}`;
}

export default function GameTab({
  data, 
  musicSelection,
  currentCharacterId, 
  characterTemporaryDisabled,
  playingOrder,
  setCurrentCharacterId
}: GameTabProps) {

  // region states
  const [, forceRerender] = useState<{}>({}); // used to force re-render
  const [judge, setJudge] = useState<GameJudge>(new GameJudge());
  const [cardWidthPercentage, setCardWidthPercentage] = useState<number>(0.08);
  const [cardSelectionSliderValue, setCardSelectionSliderValue] = useState<number>(0);
  const [unusedCards, setUnusedCards] = useState<CardInfo[]>([]);
  const [hoveringCardInfo, setHoveringCardInfo] = useState<CardInfo | null>(null);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const playOrderSet = new Set(playingOrder);
  const cards: Map<string, CardRenderProps> = new Map();
  const placeholderCards: Array<Position> = new Array<Position>();
  const naturalCardOrder: Array<CardInfo> = new Array<CardInfo>();
  const cardInsideDeck: Set<string> = new Set();
  const characterInsideDeck: Set<CharacterId> = new Set();

  const canvasSpacing = 6;
  const canvasMargin = 16;
  const opponentDeckTop = canvasMargin;
  const deckColumns = judge.deckColumns; const deckRows = judge.deckRows;
  const canvasWidth = (containerRef.current ? containerRef.current.clientWidth : 800) - canvasMargin * 2;
  const cardWidth = canvasWidth * cardWidthPercentage;
  const cardHeight = cardWidth / CardAspectRatio;
  const deckWidth = deckColumns * cardWidth + (deckColumns - 1) * canvasSpacing;
  const deckHeight = deckRows * cardHeight + (deckRows - 1) * canvasSpacing;
  const deckLeft = (canvasWidth - deckWidth) / 2;
  const buttonSize = 48;
  const sliderHeight = 28;
  let middleBarTop = canvasMargin;
  let middleBarHeight = 0;
  if (judge.opponentType !== OpponentType.None) {
    middleBarTop += deckHeight + canvasSpacing;
  }
  if (judge.state === GameJudgeState.SelectingCards) {
    middleBarHeight = cardHeight + canvasSpacing + sliderHeight;
  } else {
    middleBarHeight = 48;
  }
  const middleBarBottom = middleBarTop + middleBarHeight;
  const playerDeckTop = middleBarBottom + canvasSpacing;
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

  const canvasPositionToDeckPosition = (x: number, y: number, allowedDecks: Array<number> = [0, 1]): {deckIndex: 0 | 1, cardIndex: number} | null => {
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
      if (dragInfo) {
        if (dragInfo.cardInfo.characterId === characterId && dragInfo.cardInfo.cardIndex !== cardInfo.cardIndex) {
          return true;
        }
      }
      if (characterInsideDeck.has(characterId) && !cardInsideDeck.has(cardInfo.toKey())) {
        return true;
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

  // region use effects
  useEffect(() => {
    judge.playingOrder = playingOrder;
    judge.characterTemporaryDisabled = characterTemporaryDisabled;
    judge.currentCharacterId = currentCharacterId;
    setJudge(judge.reconstruct());
  }, [playingOrder, characterTemporaryDisabled, currentCharacterId]);

  useEffect(() => {
    // resize
    const handleResize = () => {
      forceRerender({});
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

  // create all cards

  // Alice deck
  judge.deck[0].forEach((cardInfo, index) => {
    if (cardInfo.characterId === null) {
      placeholderCards.push(toDeckCardPosition(0, index));
    } else {
      const cardKey = cardInfo.toKey();
      const cardProps = cards.get(cardKey);
      if (cardProps === undefined) return;
      const pos = toDeckCardPosition(0, index);
      cardProps.x = pos.x;
      cardProps.y = pos.y;
      if (judge.state === GameJudgeState.SelectingCards) {
        cardProps.onMouseEnter = () => {
          setHoveringCardInfo(cardInfo);
        };
        cardProps.onMouseLeave = () => {
          setHoveringCardInfo(null);
        };
      }
    }
  });

  // Bob deck
  if (judge.opponentType !== OpponentType.None) {
    judge.deck[1].forEach((cardInfo, index) => {
      if (cardInfo.characterId === null) {
        placeholderCards.push(toDeckCardPosition(1, index));
      } else {
        const cardKey = cardInfo.toKey();
        const cardProps = cards.get(cardKey);
        if (cardProps === undefined) return;
        const pos = toDeckCardPosition(1, index);
        cardProps.x = pos.x;
        cardProps.y = pos.y;
        cardProps.upsideDown = true;
      }
    });
  }

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

  // dragging when selecting
  if (judge.state === GameJudgeState.SelectingCards && dragInfo !== null) {
    const deckPos = canvasPositionToDeckPosition(
      dragInfo.currentMouseX,
      dragInfo.currentMouseY,
      [0] // only allow player deck
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
          const otherCardInfos = characterIdToCardInfos(cardInfo.characterId!, cardInfo.cardIndex);
          break;
        }
      }
      // check if mouse on any deck card
      const deckPos = canvasPositionToDeckPosition(mouseX, mouseY, [0]);
      if (deckPos !== null) {
        const cardInfo = judge.getDeck(deckPos.deckIndex, deckPos.cardIndex);
        if (cardInfo !== null) {
          // remove from deck
          judge.removeFromDeck(deckPos.deckIndex, cardInfo);
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
        [0] // only allow player deck
      );
      if (currentTime - dragInfo.mouseDownTimestamp < 100) {
        if (dragInfo.dragType === "fromSelectable") {
          // add to deck at first empty slot
          for (let i = 0; i < judge.deckRows * judge.deckColumns; i++) {
            const already = judge.getDeck(0, i);
            if (already === null) {
              deckPos = { deckIndex: 0, cardIndex: i };
              break;
            }
          }
        } else if (dragInfo.dragType === "fromDeck") {
          deckPos = null;
        }
      }
      if (deckPos !== null) {
        // check if already have, remove it first
        const already = judge.getDeck(0, deckPos.cardIndex);
        if (already !== null) {
          judge.removeFromDeck(0, already);
          if (dragInfo.dragType === "fromDeck") {
            // swap
            judge.addToDeck(0, already, dragInfo.dragFromDeck!.cardIndex);
          }
        }
        // add to deck
        judge.addToDeck(0, dragInfo.cardInfo, deckPos.cardIndex);
        setJudge(judge.reconstruct());
      }
      setDragInfo(null);
    }
  }

  // region render
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
            }}
          />
        })}
        {unusedCards.length > 0 && <Typography
          sx={{
            position: "absolute",
            left: `${canvasMargin}px`,
            top: `${unusedCardsBottom + canvasSpacing}px`,
          }}
        >
          Unused cards
        </Typography>}
      </Box>
    </Box>
  )
}