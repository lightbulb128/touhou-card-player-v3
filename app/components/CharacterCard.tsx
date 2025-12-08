import { CharacterId, GlobalData } from "../types/Configs";

enum CardBackgroundState {
    Placeholder,
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
    cardSelection: number;
    backgroundState: CardBackgroundState;
    raiseOnHover?: boolean;
    raiseDirection?: "up" | "down";
}

export default function CharacterCard({
    data, characterId, backgroundState, cardSelection, raiseOnHover, raiseDirection
}: CharacterCardProps) {
    if (raiseOnHover === undefined) {
        raiseOnHover = false;
    }
    if (raiseDirection === undefined) {
        raiseDirection = "up";
    }
    const isPlaceholder: boolean = backgroundState === CardBackgroundState.Placeholder || characterId === "";
    const characterConfig = isPlaceholder ? null : data.characterConfigs.get(characterId);
    let cardIds = characterConfig?.card;
    let cardId = "";
    if (Array.isArray(cardIds)) {
        cardId = cardIds[cardSelection % cardIds.length];
    } else if (typeof cardIds === "string") {
        cardId = cardIds;
    }
    const cardSource = isPlaceholder ? "" : `${data.cardSourcePrefix}/${cardId}.webp`;
    let backgroundColor = "transparent";
    if (!isPlaceholder) {
        switch (backgroundState) {
            case CardBackgroundState.Normal:
                backgroundColor = "#ffffff";
                break;
            case CardBackgroundState.Hover:
                backgroundColor = "#b3f9ffff";
            case CardBackgroundState.Disabled:
                backgroundColor = "#d3d3d3ff";
                break;
            case CardBackgroundState.DisabledHover:
                backgroundColor = "#92b6beff";
                break;
            case CardBackgroundState.Selected:
                backgroundColor = "#71d7ffff";
                break;
            case CardBackgroundState.Correct:
                backgroundColor = "#bef3beff";
                break;
            case CardBackgroundState.Incorrect:
                backgroundColor = "#ffcccbff";
                break;
        }
    }
    const isGrayscale = backgroundState === CardBackgroundState.Disabled || backgroundState === CardBackgroundState.DisabledHover;
    const borderStyle = isPlaceholder ? "2px dashed gray" : "none";
}
