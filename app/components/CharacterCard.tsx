import { CharacterId, GlobalData } from "../types/Configs";

enum CardBackgroundState {
    Normal,
    Hover,
    Disabled,
    DisabledHover,
    Selected,
    Correct,
    Incorrect
}

export interface CharacterCardProps {
    data: GlobalData;
    characterId: CharacterId;
    backgroundState: CardBackgroundState;
}

export default function CharacterCard({
    data, characterId, backgroundState
}: CharacterCardProps) {
    const isPlaceholder: boolean = characterId === "";
}
