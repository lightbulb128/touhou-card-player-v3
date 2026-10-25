"use client";

import { Button, Slider, Stack, TextField, Typography } from "@mui/material";
import {
  AddRounded, Casino, ClassRounded, ClearRounded, EastRounded, FilterList,
  PauseRounded, Pending, PlayArrowRounded, RemoveRounded, ShuffleRounded,
  SkipNextRounded, SmartToyRounded, StarRounded, StopRounded, WestRounded,
  GroupsRounded, PersonOffRounded,
  VolumeDownRounded as VolumeDown, VolumeUpRounded as VolumeUp,
} from "@mui/icons-material";
import { GameButton } from "../GameTabControls";
import { NoFontFamily } from "../Theme";
import { GetLocalizedString, Localization } from "../../types/Localization";
import type { LocalizedString } from "../../types/Localization";
import { cheatSanitize } from "../../types/Cheat";
import {
  CharacterId, GlobalData, MusicSelectionMap,
  PlaybackState,
} from "../../types/Configs";
import { musicInfoFor } from "../../lib/music";
import { GameJudgeState, MatchType } from "../../types/GameTypes";
import type { GameJudge } from "../../types/GameJudge";
import type { NextTurnButtonModel } from "./gameButtonModels";
import { clamp } from "../../lib/math";
import {
  CPUOpponentPresets, cpuMistakeRate, cpuReactionTimeMean, cpuReactionTimeStdDev,
  matchingCPUOpponentPreset,
} from "./cpuOpponent";
import type { CPUOpponentPresetId, CPUOpponentSetting } from "./cpuOpponent";
import { GameTimerDisplay } from "./GameTimerDisplay";
import type { GameTimerDisplayHandle } from "./GameTimerDisplay";
import type { BoardLayout, DeckColumnVisibility } from "../../lib/geometry";
import { CardWidthPercentageMin, computeDeckColumnLayout } from "../../lib/geometry";
import { RefObject } from "react";

/**
 * Every interactive control that floats over the board. Each sub-component is positioned
 * absolutely from the shared `BoardLayout`, so no manual y-cursor bookkeeping is needed
 * except where the original described a genuine column.
 */

const absoluteAt = (x: number, y: number, extra?: object) => ({
  position: "absolute", left: `${x}px`, top: `${y}px`, ...extra,
});

/**
 * Percent text field value for a 0..1 fraction. The multiply is done here rather than in the JSX
 * so preset fractions like 0.018 cannot leak their binary rounding into the input as
 * "1.7999999999999998".
 */
const fractionToPercentInput = (fraction: number): number => Number((fraction * 100).toFixed(2));

/**
 * One line of the opponent read-out: the average reaction time, the spread around it, and the
 * error rate, all for a playground of `cardCount` cards.
 */
function hintValueText(setting: CPUOpponentSetting, cardCount: number): string {
  return GetLocalizedString(Localization.GameOpponentSettingHintValue, new Map([
    ["time", cpuReactionTimeMean(setting, cardCount).toFixed(1)],
    ["deviation", cpuReactionTimeStdDev(setting, cardCount).toFixed(1)],
    ["mistake", String(Math.round(cpuMistakeRate(setting, cardCount) * 100))],
  ]));
}

// region deck column

export type StartButtonModel = {
  text: string;
  disabled: boolean;
  contained: boolean;
  color: "primary" | "secondary" | "info";
  isStopGame: boolean;
  isGameFinished: boolean;
  onClick: () => void;
};

export type OpponentButtonModel = {
  text: string;
  matchType: MatchType;
  isServerClientObserver: boolean;
  onClick: () => void;
};

export interface DeckColumnControlsProps {
  layout: BoardLayout;
  visibility: DeckColumnVisibility;
  isMusicFilteredByDeck: boolean;
  cardWidthPercentage: number;
  /** The widest this deck allows, which is narrower than the user ceiling on a wide deck. */
  cardWidthPercentageLimit: number;
  cardCanGrow: boolean;
  deckRows: number;
  maxDeckRows: number;
  deckIsEmpty: boolean;
  /** True when the deck is full or no character is left to fill it with. */
  randomFillDisabled: boolean;
  startButton: StartButtonModel;
  opponentButton: OpponentButtonModel;
  onCardSmaller: () => void;
  onCardLarger: () => void;
  onFilterByDeck: () => void;
  onRandomFill: () => void;
  onClearDeck: () => void;
  onShuffleDeck: () => void;
  onRemoveRow: () => void;
  onAddRow: () => void;
}

export function DeckColumnControls({
  layout, visibility, isMusicFilteredByDeck, cardWidthPercentage, cardWidthPercentageLimit,
  cardCanGrow, deckRows, maxDeckRows, randomFillDisabled, deckIsEmpty,
  startButton, opponentButton,
  onCardSmaller, onCardLarger, onFilterByDeck, onRandomFill, onClearDeck,
  onShuffleDeck, onRemoveRow, onAddRow,
}: DeckColumnControlsProps) {
  const x = layout.deckRight + layout.canvasMargin;
  const { positions } = computeDeckColumnLayout(layout, visibility);

  return (
    <>
      <GameButton
        text={GetLocalizedString(Localization.GameCardSmaller)}
        onClick={onCardSmaller}
        disabled={cardWidthPercentage <= CardWidthPercentageMin}
        sx={absoluteAt(x, positions.cardSmaller)}
      >
        <WestRounded />
      </GameButton>

      <GameButton
        text={GetLocalizedString(Localization.GameCardLarger)}
        onClick={onCardLarger}
        disabled={cardWidthPercentage >= cardWidthPercentageLimit || !cardCanGrow}
        sx={absoluteAt(x, positions.cardLarger)}
      >
        <EastRounded />
      </GameButton>

      <GameButton
        text={GetLocalizedString(Localization.GameFilterByDeck)}
        onClick={onFilterByDeck}
        disabled={isMusicFilteredByDeck}
        hidden={!visibility.filterByDeck}
        sx={absoluteAt(x, positions.filterByDeck)}
      >
        <FilterList />
      </GameButton>

      <GameButton
        text={startButton.text}
        disabled={startButton.disabled}
        hidden={!visibility.start}
        color={startButton.color}
        onClick={startButton.onClick}
        sx={absoluteAt(x, positions.start)}
        contained={startButton.contained}
      >
        {!startButton.isStopGame && (
          <PlayArrowRounded htmlColor={(startButton.contained && !startButton.disabled) ? "white" : "inherit"} />
        )}
        {startButton.isStopGame && <StopRounded />}
      </GameButton>

      <GameButton
        text={GetLocalizedString(Localization.GameRandomFill)}
        onClick={onRandomFill}
        disabled={!visibility.randomFill || randomFillDisabled}
        hidden={!visibility.randomFill}
        sx={absoluteAt(x, positions.randomFill)}
      >
        <Casino />
      </GameButton>

      <GameButton
        text={GetLocalizedString(Localization.GameClearDeck)}
        onClick={onClearDeck}
        disabled={!visibility.clearDeck || deckIsEmpty}
        hidden={!visibility.clearDeck}
        sx={absoluteAt(x, positions.clearDeck)}
      >
        <ClearRounded />
      </GameButton>

      <GameButton
        text={GetLocalizedString(Localization.GameShuffleDeck)}
        onClick={onShuffleDeck}
        disabled={!visibility.shuffleDeck || deckIsEmpty}
        hidden={!visibility.shuffleDeck}
        sx={absoluteAt(x, positions.shuffleDeck)}
      >
        <ShuffleRounded />
      </GameButton>

      <GameButton
        hidden={!visibility.switchOpponent}
        text={opponentButton.text}
        sx={absoluteAt(x, positions.switchOpponent)}
        onClick={opponentButton.onClick}
      >
        {opponentButton.matchType === MatchType.None && <PersonOffRounded />}
        {opponentButton.matchType === MatchType.CPU && <SmartToyRounded />}
        {opponentButton.isServerClientObserver && <GroupsRounded />}
      </GameButton>

      <GameButton
        onClick={onRemoveRow}
        disabled={!visibility.removeRow || deckRows <= 1}
        hidden={!visibility.removeRow}
        sx={absoluteAt(x, positions.removeRow)}
      >
        <RemoveRounded />
      </GameButton>

      <GameButton
        onClick={onAddRow}
        disabled={!visibility.addRow || deckRows >= maxDeckRows}
        hidden={!visibility.addRow}
        sx={absoluteAt(x, positions.addRow)}
      >
        <AddRounded />
      </GameButton>
    </>
  );
}

export function DeckSizeControls({
  layout, canEditDeck, deckColumns, maxDeckColumns,
  onAddColumn, onRemoveColumn,
}: {
  layout: BoardLayout;
  /** Column resizing is only offered while building a lineup. */
  canEditDeck: boolean;
  deckColumns: number;
  maxDeckColumns: number;
  onAddColumn: () => void;
  onRemoveColumn: () => void;
}) {
  const y = layout.playerDeckTop + layout.deckHeight + layout.canvasMargin;
  const addX = layout.deckLeft + layout.deckWidth - layout.buttonSize;
  const removeX = addX - (layout.buttonSize + layout.canvasSpacing);

  return (
    <>
      <GameButton
        onClick={onAddColumn}
        disabled={!canEditDeck || deckColumns >= maxDeckColumns}
        hidden={!canEditDeck}
        sx={absoluteAt(addX, y, { zIndex: 1000 })}
      >
        <AddRounded />
      </GameButton>
      <GameButton
        onClick={onRemoveColumn}
        disabled={!canEditDeck || deckColumns <= 1}
        hidden={!canEditDeck}
        sx={absoluteAt(removeX, y, { zIndex: 1000 })}
      >
        <RemoveRounded />
      </GameButton>
    </>
  );
}

// region volume

export function VolumeControl({
  layout, volume, setVolume,
}: {
  layout: BoardLayout;
  volume: number;
  setVolume: (volume: number) => void;
}) {
  const x = layout.deckLeft - layout.canvasMargin;
  const iconSize = 24;
  const upY = layout.playerDeckTop;
  const sliderY = upY + iconSize + layout.canvasSpacing;
  let sliderHeight = layout.cardHeight - iconSize * 2 - layout.canvasSpacing * 2;
  if (sliderHeight < 50) { sliderHeight = 50; }
  const downY = sliderY + sliderHeight + layout.canvasSpacing;

  return (
    <>
      <VolumeUp
        fontSize="small"
        key="volume-up-label"
        sx={{
          position: "absolute", left: `${x}px`, top: `${upY}px`,
          transform: "translateX(-100%)",
          transition: "left 0.3s ease, top 0.3s ease",
        }}
      />
      <Slider
        size="small"
        key="volume-slider"
        orientation="vertical"
        value={volume}
        onChange={(_event, newValue) => {
          setVolume(Array.isArray(newValue) ? newValue[0] : newValue);
        }}
        min={0} max={1} step={0.10}
        sx={{
          position: "absolute",
          left: `${x}px`,
          top: `${sliderY}px`,
          height: `${sliderHeight}px`,
          transform: "translateX(-85%)",
          transition: "left 0.3s ease, top 0.3s ease, height 0.3s ease",
          zIndex: 1000,
        }}
      />
      <VolumeDown
        fontSize="small"
        key="volume-down-label"
        sx={{
          position: "absolute", left: `${x}px`, top: `${downY}px`,
          transform: "translateX(-100%)",
          transition: "left 0.3s ease, top 0.3s ease",
        }}
      />
    </>
  );
}

// region middle bar

export interface MiddleBarProps {
  layout: BoardLayout;
  judge: GameJudge;
  data: GlobalData;
  musicSelection: MusicSelectionMap;
  currentCharacterId: CharacterId;
  playbackState: PlaybackState;
  timerRef: RefObject<GameTimerDisplayHandle | null>;
  /** Built by the rules-side models, not here: the view only renders them. */
  nextTurnButton: NextTurnButtonModel;
  instructionText: string;
  onPlayMusic: () => void;
  onPauseMusic: () => void;
  onNextTurn: () => void;
}

export function MiddleBar({
  layout, judge, data, musicSelection, currentCharacterId, playbackState,
  timerRef, nextTurnButton, instructionText, onPlayMusic, onPauseMusic, onNextTurn,
}: MiddleBarProps) {
  const shown = judge.state !== GameJudgeState.SelectingCards;
  const timerTextWidth = 150;
  const buttonSize = 47;
  const y = layout.middleBarTop;
  const buttonY = y + layout.middleBarHeight / 2 - buttonSize / 2;

  const musicInfo = musicInfoFor(data, musicSelection, currentCharacterId);
  const titleHidden = judge.state !== GameJudgeState.TurnWinnerDetermined;
  const textWidth = judge.isObserver()
    ? layout.deckWidth - (timerTextWidth + layout.canvasSpacing)
    : layout.deckWidth - (timerTextWidth + 3 * layout.canvasSpacing + buttonSize * 2);

  const isPlay = playbackState !== PlaybackState.Playing;
  let playDisabled = playbackState === PlaybackState.CountingDown;
  if (judge.state === GameJudgeState.TurnCountdownNext) { playDisabled = true; }
  const playHidden = !shown || judge.isObserver();

  const nextClickable = !nextTurnButton.disabled;
  const nextContained = nextTurnButton.contained;
  const icon = nextTurnButton.icon;
  const nextText = nextTurnButton.text;

  return (
    <>
      <GameTimerDisplay
        key="game-timer-box"
        ref={timerRef}
        x={layout.deckLeft}
        y={y}
        width={timerTextWidth}
        height={layout.middleBarHeight}
        shown={shown}
      />

      <Typography
        key="music-title-text"
        variant="h6"
        sx={{
          position: "absolute",
          left: `${layout.deckLeft + timerTextWidth + layout.canvasSpacing}px`,
          top: `${y + layout.middleBarHeight / 2}px`,
          transform: "translateY(-100%)",
          width: `${textWidth}px`,
          opacity: (!shown || titleHidden) ? 0.0 : 1.0,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
          transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease",
          userSelect: "none",
        }}
      >
        {cheatSanitize(currentCharacterId)} / {cheatSanitize(musicInfo?.title as string)}
      </Typography>

      <Typography
        key="music-album-text"
        variant="subtitle1"
        sx={{
          position: "absolute",
          left: `${layout.deckLeft + timerTextWidth + layout.canvasSpacing}px`,
          top: `${y + layout.middleBarHeight / 2}px`,
          textOverflow: "ellipsis",
          width: `${textWidth}px`,
          opacity: (!shown || titleHidden) ? 0.0 : 1.0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease",
          userSelect: "none",
        }}
      >
        {cheatSanitize(musicInfo?.album as string)}
      </Typography>

      <GameButton
        key="play-pause-button"
        disabled={playDisabled}
        hidden={playHidden}
        sx={absoluteAt(layout.deckRight - buttonSize * 2 - layout.canvasSpacing, buttonY, {
          opacity: playHidden ? 0.0 : 1.0,
          transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
        })}
        onClick={isPlay ? onPlayMusic : onPauseMusic}
      >
        {isPlay && <PlayArrowRounded fontSize="large" />}
        {!isPlay && <PauseRounded fontSize="large" />}
      </GameButton>

      <GameButton
        key="next-turn-button"
        disabled={!nextClickable}
        hidden={nextTurnButton.hidden}
        text={nextText}
        sx={absoluteAt(layout.deckRight - buttonSize, buttonY, {
          opacity: nextTurnButton.hidden ? 0.0 : 1.0,
          transition: "left 0.3s ease, top 0.3s ease, opacity 0.3s ease",
        })}
        onClick={onNextTurn}
        contained={nextContained}
        color={nextContained ? "info" : "primary"}
      >
        {icon === "skip" && (
          <SkipNextRounded fontSize="large" htmlColor={(nextContained && nextClickable) ? "white" : "inherit"} />
        )}
        {icon === "pending" && (
          <Pending fontSize="large" htmlColor={(nextContained && nextClickable) ? "white" : "inherit"} />
        )}
        {icon === "finished" && (
          <StopRounded fontSize="large" htmlColor={(nextContained && nextClickable) ? "white" : "inherit"} />
        )}
        {icon === "shuffle" && (
          <ShuffleRounded fontSize="large" htmlColor={(nextContained && nextClickable) ? "white" : "inherit"} />
        )}
      </GameButton>

      {instructionText !== "" && (
        <Typography
          key="next-turn-instruction"
          variant="body1"
          sx={{
            userSelect: "none",
            position: "absolute",
            left: `${layout.deckLeft}px`,
            top: `${layout.playerDeckBottom + layout.canvasMargin}px`,
            width: `${layout.deckWidth}px`,
            fontFamily: NoFontFamily,
          }}
        >
          {instructionText}
        </Typography>
      )}
    </>
  );
}

// region opponent deck

export interface OpponentDeckControlsProps {
  layout: BoardLayout;
  judge: GameJudge;
  isMelee: boolean;
  isCPU: boolean;
  is1v1: boolean;
  isSelectingCards: boolean;
  cpuOpponentSetting: CPUOpponentSetting;
  onCpuOpponentSettingChange: (setting: CPUOpponentSetting) => void;
  onToggleTraditionalMode: () => void;
  onShuffleOpponentDeck: () => void;
  onClearOpponentDeck: () => void;
  onRandomFillOpponentDeck: () => void;
  /** True when the opponent deck is full or no character is left to fill it with. */
  randomFillDisabled: boolean;
}

export function OpponentDeckControls({
  layout, judge, isMelee, isCPU, is1v1, isSelectingCards, cpuOpponentSetting,
  onCpuOpponentSettingChange, onToggleTraditionalMode, onShuffleOpponentDeck,
  onClearOpponentDeck, onRandomFillOpponentDeck, randomFillDisabled,
}: OpponentDeckControlsProps) {
  const rightX = layout.deckRight + layout.canvasMargin;
  const leftX = layout.deckLeft - layout.canvasMargin;
  const stride = layout.buttonSize + layout.canvasSpacing;

  // region right column, built bottom-up from the opponent deck
  let rightY = layout.opponentDeckBottom - layout.buttonSize;
  const traditionalY = rightY;
  rightY -= stride;
  const shuffleY = rightY;
  rightY -= stride;
  const clearY = rightY;
  rightY -= stride;
  const fillY = rightY;

  const traditionalHidden = !isSelectingCards || judge.matchType === MatchType.None || isMelee;
  const explanationHidden = !is1v1 || !isSelectingCards;
  const traditionalExplanation = judge.traditionalMode
    ? GetLocalizedString(Localization.GameModeTraditionalDescription)
    : GetLocalizedString(Localization.GameModeNonTraditionalDescription);
  const cpuDeckActionsHidden = !isSelectingCards || !isCPU;
  const cpuDeckActionsDisabled = cpuDeckActionsHidden || judge.players.length < 2;

  // region left column: CPU tuning, only meaningful while selecting cards versus the CPU
  const settingsShown = isSelectingCards && judge.matchType === MatchType.CPU;
  const settingsHidden = !settingsShown;
  // The two board sizes the read-out below the inputs quotes: every card in both decks, and the
  // single last card. The CPU's reaction time and mistake rate grow with the logarithm of the
  // card count, which is why a full board plays slower and sloppier than a nearly cleared one.
  const fullDeckCards = Math.max(layout.deckRows * layout.deckColumns * 2, 1);
  const activePreset = matchingCPUOpponentPreset(cpuOpponentSetting);
  const presetLabel: Record<CPUOpponentPresetId, LocalizedString> = {
    easy: Localization.GameOpponentPresetEasy,
    normal: Localization.GameOpponentPresetNormal,
    hard: Localization.GameOpponentPresetHard,
    lunatic: Localization.GameOpponentPresetLunatic,
  };

  // The stack runs top-down from the opponent deck, one field per row. The fields are short and
  // narrow so the four-line read-out below them still clears the volume control that shares this
  // gutter on a one-row board.
  const settingsFieldWidth = 110;
  const settingsFieldHeight = 30;
  /** Tighter than `canvasSpacing` between the fields themselves: they are small, so the rows need less air. */
  const settingsFieldGapY = 5;
  const settingsFieldAdvance = settingsFieldHeight + settingsFieldGapY;
  const hintLineSpacing = 19;
  const hintLineHeight = 20;
  const hintBlockHeight = hintLineSpacing * 3 + hintLineHeight;

  let leftY = layout.opponentDeckTop;
  const settingsTitleY = leftY;
  leftY += 24 + layout.canvasSpacing;
  const presetRowY = leftY;
  leftY += 32 + layout.canvasSpacing;
  const reactionLabelY = leftY;
  leftY += 24 + layout.canvasSpacing;
  const reactionBaseY = leftY;
  leftY += settingsFieldAdvance;
  const reactionPerDoublingY = leftY;
  leftY += settingsFieldAdvance;
  const reactionSigmaY = leftY;
  leftY += settingsFieldAdvance;
  const mistakeLabelY = leftY;
  leftY += 24 + layout.canvasSpacing;
  const mistakeBaseY = leftY;
  leftY += settingsFieldAdvance;
  const mistakePerDoublingY = leftY;
  leftY += settingsFieldAdvance;
  const hintY = leftY;
  /**
   * Whether the volume control leaves room for the read-out. It shares this gutter and rises as the
   * board shrinks, because its position is the near deck's top edge; on a board too short and wide
   * for both, the read-out steps aside rather than drawing over the volume slider.
   */
  const hintShown = layout.playerDeckTop >= hintY + hintBlockHeight;
  // The read-out quotes the same two board sizes the curve is anchored on, in the order the
  // inputs above it describe the curve: how fast, how variable, how often wrong.
  const fullDeckHintLabel = GetLocalizedString(Localization.GameOpponentSettingHintFullDeck, new Map([
    ["cards", String(fullDeckCards)],
  ]));
  const fullDeckHintValue = hintValueText(cpuOpponentSetting, fullDeckCards);
  const lastCardHintLabel = GetLocalizedString(Localization.GameOpponentSettingHintLastCard);
  const lastCardHintValue = hintValueText(cpuOpponentSetting, 1);

  const leftTextSx = {
    userSelect: "none",
    position: "absolute" as const,
    transform: "translateX(-100%)",
    opacity: settingsHidden ? 0.0 : 1.0,
    transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
    fontFamily: NoFontFamily,
  };
  const leftInputSx = {
    userSelect: "none",
    position: "absolute" as const,
    transform: "translateX(-100%)",
    opacity: settingsHidden ? 0.0 : 1.0,
    transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
  };
  /** One short tuning field: narrow, and shorter than MUI's small size so five of them fit. */
  const settingsFieldSx = {
    ...leftInputSx,
    width: `${settingsFieldWidth}px`,
    "& .MuiInputBase-root": { height: `${settingsFieldHeight}px`, fontSize: 13 },
    "& .MuiOutlinedInput-input": { padding: `0 10px`, fontSize: 13 },
    "& .MuiInputLabel-root": { fontSize: 13 },
  };
  const hintLineSx = {
    ...leftTextSx,
    opacity: settingsHidden || !hintShown ? 0.0 : 1.0,
    left: `${leftX}px`,
    whiteSpace: "nowrap" as const,
    textAlign: "right" as const,
  };

  return (
    <>
      <GameButton
        key="opponent-traditional-mode-button"
        hidden={traditionalHidden}
        disabled={judge.isObserver()}
        text={judge.traditionalMode
          ? GetLocalizedString(Localization.GameModeTraditional)
          : GetLocalizedString(Localization.GameModeNonTraditional)}
        onClick={onToggleTraditionalMode}
        sx={absoluteAt(rightX, traditionalY)}
      >
        {judge.traditionalMode ? <ClassRounded /> : <StarRounded />}
      </GameButton>

      <Typography
        key="opponent-traditional-mode-explanation"
        variant="body1"
        sx={{
          userSelect: "none",
          position: "absolute",
          left: `${layout.deckLeft}px`,
          top: `${layout.playerDeckBottom + layout.canvasMargin}px`,
          width: `${layout.deckWidth - layout.buttonSize * 2 - layout.canvasMargin}px`,
          opacity: explanationHidden ? 0.0 : 1.0,
          transition: "opacity 0.3s ease, left 0.3s ease, top 0.3s ease",
          fontFamily: NoFontFamily,
        }}
      >
        {traditionalExplanation.split("\n").map((line, index) => (
          <span key={index}>
            {line}
            <br />
          </span>
        ))}
      </Typography>

      <GameButton
        key="shuffle-opponent-deck-button"
        disabled={cpuDeckActionsDisabled || judge.isDeckEmpty(1)}
        hidden={cpuDeckActionsHidden}
        text={GetLocalizedString(Localization.GameShuffleDeck)}
        onClick={onShuffleOpponentDeck}
        sx={absoluteAt(rightX, shuffleY)}
      >
        <ShuffleRounded />
      </GameButton>

      <GameButton
        key="clear-opponent-deck-button"
        disabled={cpuDeckActionsDisabled || judge.isDeckEmpty(1)}
        hidden={cpuDeckActionsHidden}
        text={GetLocalizedString(Localization.GameClearDeck)}
        onClick={onClearOpponentDeck}
        sx={absoluteAt(rightX, clearY)}
      >
        <ClearRounded />
      </GameButton>

      <GameButton
        key="random-fill-opponent-deck-button"
        disabled={cpuDeckActionsDisabled || randomFillDisabled}
        hidden={cpuDeckActionsHidden}
        text={GetLocalizedString(Localization.GameRandomFill)}
        onClick={onRandomFillOpponentDeck}
        sx={absoluteAt(rightX, fillY)}
      >
        <Casino />
      </GameButton>

      <Typography key="opponent-deck-label" variant="h6" sx={{ ...leftTextSx, left: `${leftX}px`, top: `${settingsTitleY}px` }}>
        {GetLocalizedString(Localization.GameOpponentSettingTitle)}
      </Typography>
      <Stack
        key="opponent-preset-row"
        direction="row"
        spacing={0.5}
        sx={{ ...leftInputSx, width: "auto", left: `${leftX}px`, top: `${presetRowY}px` }}
      >
        {(["easy", "normal", "hard", "lunatic"] as Array<CPUOpponentPresetId>).map((id) => (
          <Button
            key={id}
            size="small"
            variant={activePreset === id ? "contained" : "outlined"}
            disabled={settingsHidden}
            onClick={() => { onCpuOpponentSettingChange({ ...CPUOpponentPresets[id] }); }}
            sx={{
              minWidth: 0, px: 0.75, py: 0.25,
              fontSize: 12, lineHeight: 1.5,
              textTransform: "none", whiteSpace: "nowrap", fontFamily: NoFontFamily,
            }}
          >
            {GetLocalizedString(presetLabel[id])}
          </Button>
        ))}
      </Stack>
      <Typography key="opponent-reaction-label" variant="body1" sx={{ ...leftTextSx, left: `${leftX}px`, top: `${reactionLabelY}px` }}>
        {GetLocalizedString(Localization.GameOpponentSettingReactionTime)}
      </Typography>
      <TextField
        key="opponent-reaction-base-input"
        type="number"
        size="small"
        value={cpuOpponentSetting.reactionTimeBase}
        label={GetLocalizedString(Localization.GameOpponentSettingReactionBase)}
        disabled={settingsHidden}
        onChange={(event) => {
          const value = parseFloat(event.target.value);
          onCpuOpponentSettingChange({
            ...cpuOpponentSetting,
            reactionTimeBase: clamp(Number.isNaN(value) ? 1.5 : value, 0.1, 10),
          });
        }}
        slotProps={{
          htmlInput: { min: 0.1, max: 10, step: 0.1 },
          inputLabel: { style: { fontFamily: NoFontFamily } },
        }}
        sx={{ ...settingsFieldSx, left: `${leftX}px`, top: `${reactionBaseY}px` }}
      />
      <TextField
        key="opponent-reaction-per-doubling-input"
        type="number"
        size="small"
        value={cpuOpponentSetting.reactionTimePerDoubling}
        label={GetLocalizedString(Localization.GameOpponentSettingReactionPerDoubling)}
        disabled={settingsHidden}
        onChange={(event) => {
          const value = parseFloat(event.target.value);
          onCpuOpponentSettingChange({
            ...cpuOpponentSetting,
            reactionTimePerDoubling: clamp(Number.isNaN(value) ? 0.8 : value, 0, 10),
          });
        }}
        slotProps={{
          htmlInput: { min: 0.0, max: 10, step: 0.05 },
          inputLabel: { style: { fontFamily: NoFontFamily } },
        }}
        sx={{ ...settingsFieldSx, left: `${leftX}px`, top: `${reactionPerDoublingY}px` }}
      />
      <TextField
        key="opponent-reaction-time-stddev-input"
        type="number"
        size="small"
        value={cpuOpponentSetting.reactionTimeSigma}
        label={GetLocalizedString(Localization.GameOpponentSettingReactionStdDev)}
        disabled={settingsHidden}
        onChange={(event) => {
          const value = parseFloat(event.target.value);
          onCpuOpponentSettingChange({
            ...cpuOpponentSetting,
            reactionTimeSigma: clamp(Number.isNaN(value) ? 0.25 : value, 0, 2),
          });
        }}
        slotProps={{
          htmlInput: { min: 0.0, max: 2, step: 0.05 },
          inputLabel: { style: { fontFamily: NoFontFamily } },
        }}
        sx={{ ...settingsFieldSx, left: `${leftX}px`, top: `${reactionSigmaY}px` }}
      />
      <Typography
        key="opponent-mistake-rate-label"
        variant="body1"
        sx={{ ...leftTextSx, left: `${leftX}px`, top: `${mistakeLabelY}px` }}
      >
        {GetLocalizedString(Localization.GameOpponentSettingMistakeRate)}
      </Typography>
      <TextField
        key="opponent-mistake-base-input"
        type="number"
        size="small"
        value={fractionToPercentInput(cpuOpponentSetting.mistakeRateBase)}
        label={GetLocalizedString(Localization.GameOpponentSettingMistakeBase)}
        disabled={settingsHidden}
        onChange={(event) => {
          const value = parseFloat(event.target.value);
          onCpuOpponentSettingChange({
            ...cpuOpponentSetting,
            mistakeRateBase: clamp(Number.isNaN(value) ? 0 : value, 0, 100) / 100,
          });
        }}
        slotProps={{
          htmlInput: { min: 0.0, max: 100.0, step: 1.0 },
          inputLabel: { style: { fontFamily: NoFontFamily } },
        }}
        sx={{ ...settingsFieldSx, left: `${leftX}px`, top: `${mistakeBaseY}px` }}
      />
      <TextField
        key="opponent-mistake-per-doubling-input"
        type="number"
        size="small"
        value={fractionToPercentInput(cpuOpponentSetting.mistakeRatePerDoubling)}
        label={GetLocalizedString(Localization.GameOpponentSettingMistakePerDoubling)}
        disabled={settingsHidden}
        onChange={(event) => {
          const value = parseFloat(event.target.value);
          onCpuOpponentSettingChange({
            ...cpuOpponentSetting,
            mistakeRatePerDoubling: clamp(Number.isNaN(value) ? 0 : value, 0, 100) / 100,
          });
        }}
        slotProps={{
          htmlInput: { min: 0.0, max: 100.0, step: 0.5 },
          inputLabel: { style: { fontFamily: NoFontFamily } },
        }}
        sx={{ ...settingsFieldSx, left: `${leftX}px`, top: `${mistakePerDoublingY}px` }}
      />
      <Typography
        key="opponent-hint-full-deck"
        variant="body2"
        sx={{ ...hintLineSx, top: `${hintY}px` }}
      >
        {fullDeckHintLabel}
      </Typography>
      <Typography
        key="opponent-hint-full-deck-value"
        variant="body2"
        sx={{ ...hintLineSx, top: `${hintY + hintLineSpacing}px` }}
      >
        {fullDeckHintValue}
      </Typography>
      <Typography
        key="opponent-hint-last-card"
        variant="body2"
        sx={{ ...hintLineSx, top: `${hintY + hintLineSpacing * 2}px` }}
      >
        {lastCardHintLabel}
      </Typography>
      <Typography
        key="opponent-hint-last-card-value"
        variant="body2"
        sx={{ ...hintLineSx, top: `${hintY + hintLineSpacing * 3}px` }}
      >
        {lastCardHintValue}
      </Typography>
    </>
  );
}
