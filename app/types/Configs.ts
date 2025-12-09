type MusicUniqueId = string;
type CharacterId = string;
type CardId = string;
type CharacterConfig = {
  id: CharacterId;
  card: Array<CardId>;
  musics: Array<MusicUniqueId>;
  tags: Array<string>;
}
type MusicSourceMap = Map<MusicUniqueId, string>;
type CharacterConfigMap = Map<CharacterId, CharacterConfig>;
type MusicSelectionMap = Map<CharacterId, number>;
type MusicPresets = Map<string, MusicSelectionMap>;
type MusicInfo = {
  characterId: CharacterId;
  title: string;
  album: string;
}

class GlobalData {
  characterConfigs: CharacterConfigMap;
  sources: MusicSourceMap;
  cardSourcePrefix: string;
  presets: MusicPresets;

  constructor() {
    this.characterConfigs = new Map();
    this.sources = new Map();
    this.cardSourcePrefix = "";
    this.presets = new Map();
  }

  applyFetchedCharacters(jsonData: any) {
    const characterData = jsonData; // this is a map
    for (const charId in characterData) {
      const charConfig = characterData[charId];
      let card = charConfig.card;
      if (typeof card === "string") {
        card = [card];
      }
      let music = charConfig.music;
      if (typeof music === "string") {
        music = [music];
      }
      this.characterConfigs.set(charId, {
        id: charId,
        card: card,
        musics: music,
        tags: charConfig.tags || [],
      });
    }
  };

  applyFetchedSources(jsonData: any) {
    const sourceData = jsonData;
    for (const musicId in sourceData) {
      const sourceUrl = sourceData[musicId];
      this.sources.set(musicId, sourceUrl);
    }
  };

  applyFetchedPresets(jsonData: any) {
    const presetsData = jsonData;
    for (const presetName in presetsData) {
      const selectionMap = presetsData[presetName];
      this.presets.set(presetName, selectionMap);
    }
  };

  getAnyCardSource(): string {
    for (const charConfig of this.characterConfigs.values()) {
      if (charConfig.card.length > 0) {
        return charConfig.card[0];
      }
    }
    return "";
  }
}

enum PlaybackState {
  Stopped,
  Playing,
  CountingDown,
  TimeoutPause,
}

class Playback {
  currentTime: number;
  duration: number;
  state: PlaybackState;

  constructor() {
    this.currentTime = 0;
    this.duration = 0;
    this.state = PlaybackState.Stopped;
  }
}

type PlaybackSetting = {
  countdown: boolean;
  randomStartPosition: boolean;
  playbackDuration: number;
}

function getMusicInfo(musicName: string): { title: string; album: string } {
  let albumName = ""
  // album is the string before first "/"
  albumName = musicName.substring(0, musicName.indexOf('/'));
  // get last "/" and last "."
  // and take the between as musicName
  if (musicName !== undefined) {
    let lastSlash = musicName.lastIndexOf('/');
    let lastDot = musicName.lastIndexOf('.');
    musicName = musicName.substring(lastSlash + 1, lastDot);
  }
  // remove author
  let authors = [
    "黄昏フロンティア・上海アリス幻樂団",
    "上海アリス幻樂団",
    "ZUN",
    "あきやまうに",
    "黄昏フロンティア"
  ]
  for (let i = 0; i < authors.length; i++) {
    let author = authors[i];
    if (musicName.startsWith(author + " - ")) {
      musicName = musicName.substring(author.length + 3);
    }
  }
  // if starts with a number + ".", remove it
  if (musicName.match(/^\d+\./)) {
    musicName = musicName.substring(musicName.indexOf('.') + 1);
    // if a space follows, remove it
    if (musicName.startsWith(" ")) {
      musicName = musicName.substring(1);
    }
  }
  return {
    title: musicName,
    album: albumName
  }
}

function getMusicInfoFromCharacterId(globalData: GlobalData, musicSelection: MusicSelectionMap, characterId: CharacterId): MusicInfo | null {
  const characterConfig = globalData.characterConfigs.get(characterId);
  if (!characterConfig) {
    return null;
  }
  const musicIndex = musicSelection.get(characterId) || 0;
  const musicId = characterConfig.musics[musicIndex];
  const musicInfo = getMusicInfo(musicId);
  return {
    characterId: characterId,
    ...musicInfo
  } as MusicInfo;
}

function createPlayingOrder(
  globalData: GlobalData,
  musicSelection: MusicSelectionMap,
  temporaryDisabled: Map<CharacterId, boolean>,
  randomize: boolean
): Array<CharacterId> {
  const characterIds = Array.from(globalData.characterConfigs.keys());
  let filteredIds = characterIds.filter((charId) => {
    return musicSelection.get(charId) !== -1 && !temporaryDisabled.get(charId);
  });

  if (randomize) {
    // Shuffle the array
    for (let i = filteredIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filteredIds[i], filteredIds[j]] = [filteredIds[j], filteredIds[i]];
    }
  }
  
  return filteredIds;
}

export type {
  MusicUniqueId,
  CharacterId,
  CardId,
  CharacterConfig,
  MusicSourceMap,
  CharacterConfigMap,
  MusicSelectionMap,
  MusicPresets,
  MusicInfo,
  PlaybackSetting,
};

export { 
  GlobalData , Playback, PlaybackState,
  getMusicInfo, getMusicInfoFromCharacterId, createPlayingOrder
};