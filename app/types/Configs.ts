type MusicUniqueId = string;
type CharacterId = string;
type CardId = string;
type CharacterConfig = {
    id: CharacterId;
    card: CardId | Array<CardId>;
    musics: Array<MusicUniqueId>;
    tags: Array<string>;
}
type MusicSourceMap = Map<MusicUniqueId, string>;
type CharacterConfigMap = Map<CharacterId, CharacterConfig>;
type MusicSelectionMap = Map<CharacterId, number>;

type GlobalData = {
    characterConfigs: CharacterConfigMap;
    musicSelection: MusicSelectionMap;
    sources: MusicSourceMap;
    cardSourcePrefix: string;
};

export type {
    MusicUniqueId,
    CharacterId,
    CardId,
    CharacterConfig,
    MusicSourceMap,
    CharacterConfigMap,
    MusicSelectionMap,
    GlobalData
};

