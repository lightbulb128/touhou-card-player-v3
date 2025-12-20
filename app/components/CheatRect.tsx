import { Box } from "@mui/material";
import { randomColor } from "../types/Cheat";
import { MonospaceFontFamily } from "./Theme";

export interface CheatRectProps {
  width: number;
  height: number;
}

function rnd(): number { return Math.random(); }

export default function CheatRect({ width, height }: CheatRectProps) {

  const count = Math.ceil((width + height) * 2 / 20);
  const elements = [];
  for (let i = 0; i < count; i++) {
    const place = i * ((width + height) * 2) / count;
    let x: number, y: number;
    if (place < width) {
      x = place;
      y = 0;
    } else if (place < width + height) {
      x = width;
      y = place - width;
    } else if (place < width * 2 + height) {
      x = place - width - height;
      y = height;
    } else {
      x = 0;
      y = place - width * 2 - height;
    }
    x += (rnd() - 0.5) * Math.min(width, height) * 0.2;
    y += (rnd() - 0.5) * Math.min(width, height) * 0.2;
    const fontSize = 10 + rnd() * 20;
    // create a typography element at (x, y)
    elements.push(<Box
      key={i}
      sx={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${fontSize}px`,
        height: `${fontSize}px`,
        backgroundColor: randomColor(1, 1),
        transform: "translate(-50%, -50%) rotate(" + (rnd() * 360) + "deg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        fontSize: `${10 + rnd() * 20}px`,
        fontFamily: MonospaceFontFamily,
      }}
    >
    </Box>);
  }

  return (
    <Box
      sx={{
        position: "relative",
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {elements}
    </Box>
  );
}