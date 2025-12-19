function u(en: string, zh: string): { en: string; zh: string } {
  return { en, zh };
}

let locale = "en";

function setLocale(newLocale: string) {
  locale = newLocale;
}

const GetLocalizedString = (strObj: { en: string; zh: string }, args?: Map<string, string>) => {
  let localizedString = locale === "zh" ? strObj.zh : strObj.en;
  if (args) {
    args.forEach((value, key) => {
      localizedString = localizedString.replace(`{${key}}`, value);
    });
  }
  return localizedString;
}

const Localization = {

  TabNamePlayer: u("Player", "播放"),
  TabNameList: u("List", "列表"),
  TabNameConfigs: u("Config", "设置"),
  TabNameAbout: u("Match", "游戏"),
  TabNameSourceCode: u("Source", "源码"),

  PlayerTabUpcoming: u("Upcoming (click to skip)", "接下来（点击以跳过）"),
  PlayerTabShuffle: u("Shuffle", "重新抽选"),
  PlayerTabSort: u("Sort", "重置顺序"),
  PlayerTabRandomStart: u("Random Start", "播放位置随机"),
  PlayerTabCountdown: u("Countdown", "倒计时"),
  PlayerTabPlaybackDurationLabel: u("Playback Duration (s; 0 = inf)", "播放时长（秒；0 = 无限）"),

  ConfigTabCardCollection: u("Card Collection", "卡面图集"),
  ConfigTabMusicSource: u("Music Source", "音乐源"),
  ConfigTabMusicSelectionPresets: u("Music Selection Presets", "音乐选择预设"),
  ConfigTabMusicSelectionSingle: u("Music Selection Single", "音乐选择单曲"),
  ConfigTabMusicSourceExample: u("Example", "示例曲目"),
  ConfigTabSelected: u("Selected", "正在使用"),
  ConfigTabSelect: u("Select", "使用"),
  ConfigTabApply: u("Apply", "应用"),
  ConfigTabApplied: u("Applied", "已应用"),
  ConfigTabPresetDefault: u("Default", "默认"),
  ConfigTabPresetDisable: u("Disable ", "禁用"),
  ConfigTabSearchCharacter: u("Search Character", "搜索角色"),

  GameCardSmaller: u("Card Smaller", "卡牌缩小"),
  GameCardLarger: u("Card Larger", "卡牌放大"),
  GameStartWaitingForOpponent: u("waiting for opponent...", "等待对手..."),
  GameStart: u("Start", "开始游戏"),
  GameStop : u("Stop", "中止游戏"),
  GameFinish : u("Finish", "结束游戏"),
  GameRandomFill: u("Random Fill", "随机补满"),
  GameClearDeck: u("Clear Deck", "清空卡组"),
  GameShuffleDeck: u("Shuffle Deck", "打乱卡组"),
  GameFilterByDeck: u("Filter Music by Deck", "按卡组筛选音乐"),
  
  GameOpponentNoOpponent: u("No Opponent", "无对手"),
  GameOpponentCPUOpponent: u("CPU Opponent", "电脑对手"),
  GameOpponentRemoteAsServer: u("PvP (as Server)", "玩家对战（作为服务器）"),
  GameOpponentRemoteAsClient: u("PvP (as Client)", "玩家对战（作为客户端）"),
  GameOpponentRemoteAsObserver: u("PvP (as Observer)", "玩家对战（作为观察者）"),

  GameNextTurnOpponentWaiting: u("opponent waiting...", "对手等待中..."),
  GameNextTurnWaitingForOpponent: u("waiting for opponent...", "等待对手..."),
  GameNextTurnGameFinished: u("game finished", "游戏已结束"),
  GameNextTurnGiveCards: u("give {givesLeft} card{plural}...", "交出 {givesLeft} 张卡牌"),
  GameNextTurnReceiveCards: u("receiving {receives} card{plural}...", "等待接收 {receives} 张卡牌"),

  GameInstructionGiveCards: u(
    "Give {givesLeft} card{plural} to opponent, or directly click next turn to give randomly.",
    "交出 {givesLeft} 张卡牌给对手，或者直接点击下一回合以随机交出。"
  ),
  GameInstructionReceiveCards: u(
    "You need to receive {receives} card{plural} from opponent. Please wait for opponent to give.",
    "你需要从对手处接收 {receives} 张卡牌。请等待对手交出。"
  ),
  GameInstructionReceiveCardsCPU: u(
    "You need to receive {receives} card{plural} from CPU opponent when moving to next turn.",
    "当你进入下一回合时，你将从电脑对手处接收 {receives} 张卡牌。"
  ),

  GameConnectShareCodeInstruction: u(
    "Share this code with your friend to let them join your game. Retry if generation exeeds 10s.",
    "将此代码分享给你的朋友以让他们加入你的游戏。如果生成时间超过10秒，请点击重试。"
  ),
  GameConnectEnterCodeInstruction: u(
    "Enter the share code provided by your friend to join their game:",
    "输入你的朋友提供的分享代码以加入他们的游戏："
  ),
  GameConnectionGeneratingId: u(
    "Generating connection ID...",
    "正在生成连接ID..."
  ),
  GameConnectionRetryGeneration: u(
    "Retry Generation",
    "重试生成"
  ),
  GameConnectionRegenerate: u(
    "Regenerate",
    "重新生成"
  ),
  GameConnectionCopyToClipboard: u(
    "Copy to Clipboard",
    "复制到剪贴板"
  ),
  GameConnectionConnect: u(
    "Connect",
    "连接"
  ),
  GameConnectionMyName: u(
    "Your name to display to the opponent:",
    "向对方展示的你的名称："
  ),
  GamePlayer: u("Player", "玩家"),
  GameOpponent: u("Opponent", "对手"),


  GameModeTraditional: u("Classic Mode", "传统模式"),
  GameModeNonTraditional: u("Leisure Mode", "休闲模式"),
  GameModeTraditionalDescription: u(
    "Classic Mode: Wrong picks make you receive cards from the opponent. You win by emptying your deck first.",
    "经典模式：犯错会让你从对手那里接收卡牌。你需要先清空你的卡组才能获胜。"
  ),
  GameModeNonTraditionalDescription: u(
    "Leisure Mode: Wrong picks are ignored. You win by collecting more cards.",
    "休闲模式：犯错会被忽略。清空全场卡牌时获得更多卡牌的一方获胜。"
  ),

  GameOpponentSettingTitle: u("Opponent Setting", "对手设置"),
  GameOpponentSettingReactionTime: u("Reaction Speed", "反应速度"),
  GameOpponentSettingReactionTimeMean: u("Mean (s)", "平均（秒）"),
  GameOpponentSettingReactionTimeStdDev: u("Standard deviation (s)", "标准差（秒）"),
  GameOpponentSettingMistakeRate: u("Mistake Rate (%)", "失误率（%）"),

  GameUnusedCards: u("Unused Cards", "未使用卡牌"),

  ChatMessageHint: u("Type a message to chat...", "输入消息以聊天..."),
  ChatMessageSenderSystem: u("System", "系统"),
  ChatMessagePeerConnectionError: u("Connection error", "连接错误"),
  ChatMessageConnected: u("Connected to opponent.", "已连接到对手。"),
  ChatMessageClientDisconnected: u("Disconnected from client {clientName}.", "已与客户端 {clientName} 断开连接。"),
  ChatMessageServerDisconnected: u("Disconnected from server.", "已与服务器断开连接。"),

}

export { Localization, GetLocalizedString, setLocale };