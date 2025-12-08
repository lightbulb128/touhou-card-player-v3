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
}

class Playback {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isCountingDown: boolean;

  constructor() {
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
    this.isCountingDown = false;
  }
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
};

export { GlobalData , Playback };