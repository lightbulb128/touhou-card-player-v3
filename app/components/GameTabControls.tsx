import { SxProps, Typography } from "@mui/material";
import { Box, Stack } from "@mui/system";
import { IconButton } from "@mui/material";
import { NoFontFamily, theme } from "./Theme";

export interface GameButtonProps {
  text?: string;
  disabled?: boolean;
  textOnLeft?: boolean;
  hidden?: boolean;
  textWidth?: string | number;
  color?: "error" | "inherit" | "primary" | "secondary" | "info" | "success" | "warning" | "default";
  sx?: SxProps;
  onClick?: () => void;
  children?: React.ReactNode;
  bordered?: boolean;
  size?: "small" | "medium" | "large";
  contained?: boolean;
}

export function GameButton({
  ...props
}: GameButtonProps
) {
  if (props.text === undefined) {
    props.text = "";
  }
  if (props.disabled === undefined) {
    props.disabled = false;
  }
  if (props.textOnLeft === undefined) {
    props.textOnLeft = false;
  }
  if (props.textWidth === undefined) {
    props.textWidth = "auto";
  }
  if (props.hidden === undefined) {
    props.hidden = false;
  }
  if (props.bordered === undefined) {
    props.bordered = true;
  }
  if (props.size === undefined) {
    props.size = "small";
  }
  if (props.contained === undefined) {
    props.contained = false;
  }
  return (
    <Stack 
      direction={props.textOnLeft ? "row-reverse" : "row"}
      spacing={1}
      sx={{
        userSelect: "none",
        transition: "left 0.2s ease, top 0.2s ease, opacity 0.2s ease",
        // align vertically center
        alignItems: "center",
        overflow: "hidden",
        opacity: props.hidden ? 0 : 1,
        ...props.sx
      }}
    >
      <IconButton 
        onClick={(!props.disabled && !props.hidden) ? props.onClick : undefined} disabled={props.disabled}
        color={props.color || "primary"}
        sx={{
          cursor: (props.disabled || props.hidden) ? "default" : "pointer",
          border: props.bordered ? (
            props.disabled ? `1px solid ${theme.palette.action.disabled}` : "1px solid"
          ) : "none",
          backgroundColor: props.contained ? (
            props.disabled ? "action.disabled" : "primary.main"
          ) : "transparent",
          "&:hover": {
            backgroundColor: props.contained ? (
              props.disabled ? "action.disabled" : "primary.dark"
            ) : "action.hover",
          },
        }}
        size={props.size}
      >
        {props.children}
      </IconButton>
      {props.text !== "" && <Typography
        sx={{
          width: props.textWidth,
          color: props.disabled ? "text.disabled" : (props.color || "text.primary"),
          userSelect: "none",
          pointerEvents: props.disabled ? "none" : "auto",
          textWrap: "nowrap",
          fontFamily: NoFontFamily,
        }}
      >
        {props.text}
      </Typography>}
    </Stack>
  )
}
