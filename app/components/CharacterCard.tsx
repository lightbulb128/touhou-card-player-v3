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
    imageSource: string;
    backgroundState: CardBackgroundState;
    raiseOnHover?: boolean;
    raiseDirection?: "up" | "down";
}

export default function CharacterCard({
    imageSource,
    backgroundState, raiseOnHover, raiseDirection
}: CharacterCardProps) {
    if (raiseOnHover === undefined) {
        raiseOnHover = false;
    }
    if (raiseDirection === undefined) {
        raiseDirection = "up";
    }
    const isPlaceholder: boolean = backgroundState === CardBackgroundState.Placeholder || imageSource === "";
    const cardSource = isPlaceholder ? "" : imageSource;
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
