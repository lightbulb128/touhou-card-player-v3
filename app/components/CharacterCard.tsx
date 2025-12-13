import { Box, Paper, Stack, SxProps } from "@mui/material";
import { CardAspectRatio } from "../types/Configs";
import { PagePRNG } from "../types/PagePrng";
import Image from "next/image";

const CardCollectionPrefix: Map<string, string> = new Map([
	["dairi-sd", "https://r2bucket-touhou.hgjertkljw.org/cards/"],
	["dairi", "https://r2bucket-touhou.hgjertkljw.org/cards-dairi/"],
	["enbu", "https://r2bucket-touhou.hgjertkljw.org/cards-enbu/"],
	["enbu-dolls", "https://r2bucket-touhou.hgjertkljw.org/cards-enbu-dolls/"],
	["thbwiki-sd", "https://r2bucket-touhou.hgjertkljw.org/cards-thwiki/"],
	["zun", "https://r2bucket-touhou.hgjertkljw.org/cards-zun/"],
]);

let staticGlitch: boolean | null = null;
function glitch(): boolean {
	if (staticGlitch === null) {
		// get a "g" from query params
		if (typeof window === "undefined") { return false; }
		const params = new URLSearchParams(window.location.search);
		const g = params.get("g");
		staticGlitch = (g !== null);
	}
	return staticGlitch;
}

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
	cardCollection: string;
	imageSource: string;
	backgroundState?: CardBackgroundState;
	raised?: boolean;
	raiseDirection?: "up" | "down";
	onClick?: () => void;
	sx?: SxProps;
	aspectRatio?: number;
	width: string;
	paperElevation?: number;
	paperVariant?: "elevation" | "outlined";
	upsideDown?: boolean;
	[key: string]: unknown;
}

export function CharacterCard({
	cardCollection,
	imageSource,
	backgroundState, raised, raiseDirection,
	onClick, sx, aspectRatio, width,
	paperElevation, paperVariant, upsideDown,
	...props
}: CharacterCardProps) {
	if (backgroundState === undefined) {
		backgroundState = CardBackgroundState.Normal;
	}
	if (raised === undefined) {
		raised = false;
	}
	if (raiseDirection === undefined) {
		raiseDirection = "up";
	}
	if (aspectRatio === undefined) {
		aspectRatio = CardAspectRatio;
	}
	if (paperElevation === undefined) {
		paperElevation = 2;
	}
	if (paperVariant === undefined) {
		paperVariant = "elevation";
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
	let transform = "";
	let rotation = 0;
	if (upsideDown) {
		rotation = 180;
	}
	if (glitch() && !isPlaceholder) {
		const r = PagePRNG.hash(cardSource) % 10 - 5;
		rotation += r;
	}
	if (rotation !== 0) {
		transform += `rotate(${rotation}deg)`;
	}
	if (raised) {
		if (raiseDirection === "up") {
			transform += " translateY(-10%)";
		} else {
			transform += " translateY(10%)";
		}
	}
	const cardSourcePrefix = CardCollectionPrefix.get(cardCollection) || CardCollectionPrefix.get("dairi-sd");
	return (
		<Paper elevation={paperElevation} variant={paperVariant}
			sx={{
				width: width,
				backgroundColor: backgroundColor,
				border: borderStyle,
				transition: "transform 0.3s ease, background-color 0.3s ease, filter 0.3s ease",
				transform: transform,
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
					<Box
						sx={{
							width: '100%',
							height: '100%',
							objectFit: 'cover',
							position: 'absolute',
							top: 0,
							left: 0,
						}}
					>
						<Image
							src={cardSourcePrefix + cardSource}
							alt="Character Card"
							draggable="false"
							unoptimized
							fill
							sizes="100vw"
							style={{
								userSelect: 'none',
								transition: 'filter 0.3s ease',
								filter: isGrayscale ? 'grayscale(100%)' : 'none',
							}}
						/>
					</Box>
				)}
			</Box>
		</Paper>
	)
}

export interface CharacterCardStackedProps {
	cardCollection: string;
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
	cardCollection,
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
							cardCollection={cardCollection}
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

