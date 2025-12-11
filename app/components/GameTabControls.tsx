import { SxProps, Typography } from "@mui/material";
import { Box, Stack } from "@mui/system";
import { IconButton } from "@mui/material";

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
  return (
    <Stack 
      direction={props.textOnLeft ? "row-reverse" : "row"}
      spacing={1}
      sx={{
        cursor: props.disabled ? "default" : "pointer",
        userSelect: "none",
        transition: "height 0.2s ease, left 0.2s ease, top 0.2s ease, padding-bottom 0.2s ease",
        // align vertically center
        alignItems: "center",
        height: props.hidden ? "0px" : "42px",
        overflow: "hidden",
        paddingBottom: props.hidden ? "0px" : "6px",
        ...props.sx
      }}
    >
      <IconButton 
        onClick={props.onClick} disabled={props.disabled}
        color={props.color || "primary"}
        sx={{
          border: props.disabled ? "1px solid rgba(0,0,0,0.12)" : "1px solid",
        }}
        size="small"
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
        }}
      >
        {props.text}
      </Typography>}
    </Stack>
  )
}
