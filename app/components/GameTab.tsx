"use client";

import { Box, Slider } from "@mui/material";
import { memo, useEffect, useRef, useState } from "react";
import {
  CharacterId, GlobalData, MusicSelectionMap, PlaybackSetting,
  PlaybackState,
} from "../types/Configs";
import { GameJudgeState } from "../types/GameTypes";
import { isCheatReally } from "../types/Cheat";
import {
  cardWidthPercentageLimit, computeBoardLayout, computeDeckColumnLayout,
  computeDeckColumnVisibility, growCanvasHeight,
} from "../lib/geometry";
import { CardLayer } from "./game/CardLayer";import { CheatOverlay } from "./game/CheatOverlay";
import { CollectedPiles } from "./game/CollectedPiles";
import { ChatPanel } from "./game/ChatPanel";
import { ConnectionPanel } from "./game/ConnectionPanel";
import {
  DeckColumnControls, DeckSizeControls, MiddleBar, OpponentDeckControls, VolumeControl,
} from "./game/GameControls";
import { PlayerNameOverlay, playerNameExtent } from "./game/PlayerNameOverlay";
import { playerNamePlates } from "./game/playerNamePlates";
import { buildCardVisuals } from "./game/cardVisuals";
import { createDragHandlers } from "./game/cardDrag";
import { useGameSession } from "./game/useGameSession";

export interface GameTabProps {
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  characterTemporaryDisabled: Map<CharacterId, boolean>;
  playingOrder: Array<CharacterId>;
  playbackState: PlaybackState;
  playbackSetting: PlaybackSetting;
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

/**
 * The game board. All mutable game state and side effects live in `useGameSession`; all
 * board geometry lives in `lib/geometry`; all card placement lives in `cardVisuals`. This
 * component wires them together and renders the layers.
 *
 * Memoized because it renders several hundred cards and its props only change when the match
 * settings, the deck size or the selection actually change.
 */
function GameTab(props: GameTabProps) {
  const {
    data, musicSelection, currentCharacterId, playbackState,
    volume, setVolume,
  } = props;

  const session = useGameSession(props);
  const { judge, peer, actions } = session;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [cardSelectionSliderValue, setCardSelectionSliderValue] = useState<number>(0);
  const { dragInfo, setDragInfo, hoveringCardInfo, setHoveringCardInfo } = session;

  // measuring the container (instead of reading the ref during render) keeps the board
  // geometry correct after a window resize and satisfies the refs lint rule
  useEffect(() => {
    const element = containerRef.current;
    if (!element) { return; }
    const update = () => { setContainerWidth(element.clientWidth); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);

  const layout = computeBoardLayout({
    containerWidth,
    cardWidthPercentage: session.cardWidthPercentage,
    deckRows: judge.deckRows,
    deckColumns: judge.deckColumns,
    isMelee: session.isMelee,
    isCPU: session.isCPU,
    isServer: judge.isServer(),
    isServerClientObserver: session.isServerClientObserver,
    isNoOpponent: session.isNoOpponent,
    isSelectingCards: session.isSelectingCards,
    isObserver: judge.isObserver(),
    players: judge.players,
  });

  const visuals = buildCardVisuals({
    globalData: data,
    judge,
    layout,
    musicSelection,
    currentCharacterId,
    cardSelectionSliderValue,
    dragInfo,
    hoveringCardInfo,
    unusedCards: session.unusedCards,
    onCardHover: setHoveringCardInfo,
    onDeckCardClick: actions.pickDeckCard,
  });

  const dragHandlers = createDragHandlers({
    judge,
    notifyJudgeChanged: session.markJudgeChanged,
    layout,
    selectableCards: visuals.selectableCards,
    dragInfo,
    setDragInfo,
    setHoveringCardInfo,
    sendToAll: session.sendToAll,
    isCPU: session.isCPU,
    isMelee: session.isMelee,
  });
  const canvasRect = () => containerRef.current?.getBoundingClientRect() ?? null;

  const deckColumnVisibility = computeDeckColumnVisibility({
    isSelectingCards: session.isSelectingCards,
    isTurnCountdownNext: judge.state === GameJudgeState.TurnCountdownNext,
    isObserver: judge.isObserver(),
  });

  // The canvas grows to fit the button column, the column-resize row and the name plates.
  let canvasHeight = visuals.canvasHeight;
  const columnBottomY = computeDeckColumnLayout(layout, deckColumnVisibility).bottomY;
  if (columnBottomY - layout.canvasSpacing > canvasHeight) {
    canvasHeight = columnBottomY - layout.canvasSpacing + layout.canvasMargin;
  }
  canvasHeight = growCanvasHeight(
    canvasHeight,
    layout.playerDeckTop + layout.deckHeight + layout.canvasMargin * 2 + layout.buttonSize,
  );
  canvasHeight = growCanvasHeight(canvasHeight, playerNameExtent(layout));

  const opponentClientCount = judge.players
    .slice(1)
    .filter((player) => !player.isObserver)
    .length;
  const connectionPanelShown = (judge.isServer() && opponentClientCount === 0)
    || ((judge.isClient() || judge.isObserver()) && peer.dataConnectionToServer === null);

  const cheatCard = visuals.cheatCardKey !== null ? visuals.cards.get(visuals.cheatCardKey) : undefined;
  const showCheatHint = isCheatReally() && cheatCard !== undefined && cheatCard.visible;

  const namePlates = playerNamePlates({
    layout,
    players: judge.players,
    isMelee: session.isMelee,
    myPlayerIndex: judge.myPlayerIndex,
  });

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
        onMouseDown={(event) => { dragHandlers.handleMouseDown(event, canvasRect()); }}
        onMouseMove={(event) => { dragHandlers.handleMouseMove(event, canvasRect()); }}
        onMouseUp={(event) => { dragHandlers.handleMouseUp(event, canvasRect()); }}
      >
        {session.isSelectingCards && (
          <Slider
            aria-label="Card Selection Slider"
            value={cardSelectionSliderValue}
            onChange={(_event, newValue) => { setCardSelectionSliderValue(newValue as number); }}
            min={0}
            max={1}
            step={0.001}
            sx={{
              position: "absolute",
              left: `${layout.deckLeft}px`,
              top: `${layout.middleBarTop + layout.cardHeight + layout.canvasSpacing + 16}px`,
              width: `${layout.deckWidth}px`,
              zIndex: 500,
              transition: "opacity 0.3s ease, width 0.3s ease, left 0.3s ease, top 0.3s ease",
            }}
          />
        )}

        <CardLayer
          cardCollection={data.cardCollection}
          cardWidth={layout.cardWidth}
          cards={visuals.cards}
          placeholders={visuals.placeholders}
          unusedCardsCaptionLeft={layout.canvasMargin}
          unusedCardsCaptionTop={visuals.unusedStrip.bottom + layout.canvasSpacing}
          unusedCardCount={session.unusedCards.length}
        />

        <CollectedPiles model={visuals.collectedModel} />

        <DeckColumnControls
          layout={layout}
          visibility={deckColumnVisibility}
          isMusicFilteredByDeck={session.isMusicFilteredByDeck}
          cardWidthPercentage={session.cardWidthPercentage}
          cardWidthPercentageLimit={cardWidthPercentageLimit(judge.deckColumns)}
          cardCanGrow={layout.deckRight + layout.canvasMargin + 150 + layout.canvasMargin <= layout.canvasWidth}
          deckRows={judge.deckRows}
          maxDeckRows={5}
          randomFillDisabled={session.randomFillDisabled}
          deckIsEmpty={judge.isDeckEmpty(session.localDeckIndex)}
          startButton={session.startButton}
          opponentButton={session.opponentButton}
          onCardSmaller={actions.cardSmaller}
          onCardLarger={actions.cardLarger}
          onFilterByDeck={actions.filterByDeck}
          onRandomFill={actions.randomFillDeck}
          onClearDeck={actions.clearDeck}
          onShuffleDeck={actions.shuffleDeck}
          onRemoveRow={actions.removeRow}
          onAddRow={actions.addRow}
        />

        <DeckSizeControls
          layout={layout}
          canEditDeck={deckColumnVisibility.randomFill}
          deckColumns={judge.deckColumns}
          maxDeckColumns={15}
          onAddColumn={actions.addColumn}
          onRemoveColumn={actions.removeColumn}
        />

        <MiddleBar
          layout={layout}
          judge={judge}
          data={data}
          musicSelection={musicSelection}
          currentCharacterId={currentCharacterId}
          playbackState={playbackState}
          timerRef={session.timerRef}
          nextTurnButton={session.nextTurnButton}
          instructionText={session.nextTurnInstruction}
          onPlayMusic={actions.playMusic}
          onPauseMusic={actions.pauseMusic}
          onNextTurn={actions.nextTurn}
        />

        <VolumeControl layout={layout} volume={volume} setVolume={setVolume} />

        <OpponentDeckControls
          layout={layout}
          judge={judge}
          isMelee={session.isMelee}
          isCPU={session.isCPU}
          is1v1={session.is1v1}
          isSelectingCards={session.isSelectingCards}
          cpuOpponentSetting={session.cpuOpponentSetting}
          onCpuOpponentSettingChange={session.setCpuOpponentSetting}
          onToggleTraditionalMode={actions.toggleTraditionalMode}
          onShuffleOpponentDeck={actions.shuffleOpponentDeck}
          onClearOpponentDeck={actions.clearOpponentDeck}
          onRandomFillOpponentDeck={actions.randomFillOpponentDeck}
          randomFillDisabled={session.opponentRandomFillDisabled}
        />

        <ConnectionPanel
          layout={layout}
          shown={connectionPanelShown}
          myName={session.myName}
          onMyNameChange={session.setMyName}
          isServer={judge.isServer()}
          sharedCode={peer.peer?.id ?? null}
          joinCode={session.remotePlayerIdInput}
          onJoinCodeChange={session.setRemotePlayerIdInput}
          onConnect={actions.connectToServer}
          isClient={judge.isClient()}
          onToggleClientObserver={actions.toggleClientObserver}
          onRegenerateCode={actions.regeneratePeerId}
          onCopyCode={actions.copyPeerId}
          onCopyClientJoinUrl={actions.copyClientJoinUrl}
          onCopyObserverJoinUrl={actions.copyObserverJoinUrl}
        />

        <PlayerNameOverlay
          layout={layout}
          plates={namePlates}
          connectedToServer={peer.hasConnectionToServer()}
          isObserver={judge.isObserver()}
          isClient={judge.isClient()}
          isMelee={session.isMelee}
          isSelectingCards={session.isSelectingCards}
        />

        <ChatPanel
          layout={layout}
          shown={session.isServerClientObserver}
          messages={session.chatMessages}
          onSendMessage={session.sendChatMessage}
        />

        {showCheatHint && cheatCard && (
          <CheatOverlay
            x={cheatCard.x}
            y={cheatCard.y}
            cardWidth={layout.cardWidth}
            cardHeight={layout.cardHeight}
          />
        )}
      </Box>
    </Box>
  );
}

export default memo(GameTab);
