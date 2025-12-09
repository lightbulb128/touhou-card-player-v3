import { Box, Paper, Stack, SxProps } from "@mui/material";
import { CharacterId, GlobalData } from "../types/Configs";

const CardAspectRatio = 703 / 1000;
const CardSourcePrefix = "https://r2bucket-touhou.hgjertkljw.org/cards/"

export enum CardBackgroundState {
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
	raised: boolean;
	raiseDirection?: "up" | "down";
	onClick?: () => void;
	sx?: object;
	aspectRatio?: number;
	width: string;
	[key: string]: any;
}

export function CharacterCard({
	imageSource,
	backgroundState, raised, raiseDirection,
	onClick, sx, aspectRatio, width,
	...props
}: CharacterCardProps) {
	if (raised === undefined) {
		raised = false;
	}
	if (raiseDirection === undefined) {
		raiseDirection = "up";
	}
	if (aspectRatio === undefined) {
		aspectRatio = CardAspectRatio;
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
				break;
			case CardBackgroundState.Disabled:
				backgroundColor = "#d3d3d3ff";
				break;
			case CardBackgroundState.DisabledHover:
				backgroundColor = "#97ccd6ff";
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
	const raiseTransform = raised ? (raiseDirection === "up" ? "translateY(-10%)" : "translateY(10%)") : "translateY(0px)";
	return (
		<Paper elevation={3} 
			sx={{
				width: width,
				backgroundColor: backgroundColor,
				border: borderStyle,
				transition: "transform 0.3s ease, background-color 0.3s ease, filter 0.3s ease",
				transform: raiseTransform,
				...sx,
			}}
			onClick={onClick ? () => onClick() : undefined}
			{...props}
		>
			<Box sx={{
				width: "100%",
				position: "relative",
				aspectRatio: aspectRatio,
				justifyContent: "center",
				alignItems: "center",
			}}
			>
				{!isPlaceholder && (
					<img
						src={CardSourcePrefix + cardSource}
						alt="Character Card"
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							width: '100%',
							height: 'auto',
							objectFit: 'cover',
							userSelect: 'none',
							transition: 'filter 0.3s ease',
							filter: isGrayscale ? 'grayscale(100%)' : 'none',
						}}
					/>
				)}
			</Box>
		</Paper>
	)
}

export interface CharacterCardStackedProps {
	imageSources: string[];
	raised: boolean;
	raiseDirection?: "up" | "down";
	backgroundState?: CardBackgroundState;
	expanded?: boolean;
	sx?: object;
	stackSx?: SxProps;
	boxSx?: SxProps;
}

export function CharacterCardStacked({
	imageSources,
	raised, raiseDirection,
	backgroundState, expanded, 
	stackSx, boxSx, sx,
}: CharacterCardStackedProps) {
	if (backgroundState === undefined) { backgroundState = CardBackgroundState.Normal; }
	if (expanded === undefined) { expanded = false; }
	const cardCount = imageSources.length;
	if (raised === undefined) { raised = false; }
	if (raiseDirection === undefined) { raiseDirection = "up"; }
	const raiseTransform = raised ? (raiseDirection === "up" ? "translateY(-1vw)" : "translateY(1vw)") : "none";
	return (
		<Box
			sx={{...sx}}
			display="flex" alignItems="center" justifyContent="center"
		>
			<Stack 
				direction="row" spacing={1} alignItems="center" justifyContent="center"
				sx={{ 
					...stackSx
				}}
			>
				{imageSources.map((source, index) => (
					<Box
						key={index}
						sx={{
							marginLeft: index === 0 ? "0%" : (expanded ? "2%" : "-20%") + " !important",
							zIndex: cardCount - index,
							transition: "margin-left 0.3s ease, transform 0.3s ease",
							transitionDelay: "0.3s",
							width: "100%",
							transform: raiseTransform,
							...boxSx
						}}
					>
						<CharacterCard
							key={index}
							imageSource={source}
							width="100%"
							raised={false}
							aspectRatio={CardAspectRatio}
							backgroundState={backgroundState!}
						/>
					</Box>
				))}
			</Stack>
		</Box>
	)
	
}

