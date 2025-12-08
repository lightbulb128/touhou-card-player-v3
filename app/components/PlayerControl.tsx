import { CharacterId, GlobalData } from "../types/Configs";
import { IconButton } from "@mui/material";

export interface PlayerControlProps {
    data: GlobalData;
    currentCharacterId: CharacterId;
    isPlaying: boolean;
    isCountingDown: boolean;
    onNextMusic: () => void;
    onPreviousMusic: () => void;
    onPlay(): void;
    onPause(): void;
};

function PlaybackIconButton({ disabled, icon, onClick }: 
    { disabled: boolean; icon: string; onClick: () => void }
) {
    return (
        <IconButton onClick={onClick} disabled={disabled}>
            <span className="material-symbols-outlined">
                {icon}
            </span>
        </IconButton>
    );
}


export default function PlayerControl({
    data, currentCharacterId, isPlaying, isCountingDown,
    onNextMusic, onPreviousMusic, onPlay, onPause
}: PlayerControlProps) {
    return (
        <div className="player-control">
            <PlaybackIconButton disabled={isCountingDown} icon="skip_previous" onClick={onPreviousMusic} />
            <PlaybackIconButton disabled={isCountingDown} icon={isPlaying ? "pause" : "play_arrow"} onClick={isPlaying ? onPause : onPlay} />
            <PlaybackIconButton disabled={isCountingDown} icon="skip_next" onClick={onNextMusic} />
        </div>
    );
}