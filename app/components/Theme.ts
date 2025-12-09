import { createTheme } from "@mui/material/styles";
import localFont from "next/font/local"

const inconsolata = localFont({ 
  src: "../../public/Inconsolata-VF.ttf", 
  variable: "--font-inconsolata" 
});
const yugothicb = localFont({ 
  src: "../../public/YuGothB.ttc", 
  variable: "--font-yu-gothic-bold"
});

export default function CreateTheme() {
  const themeColors = {
    primary: "#0049c7ff",
    secondary: "#9c8200ff",
    surface: "#ffffff",
    background: "#f6f7fb",
    text: "#0f172a",
    muted: "#475569",
    divider: "#e2e8f0",
  } as const;
  return createTheme({
    palette: {
      mode: "light",
      primary: { main: themeColors.primary },
      secondary: { main: themeColors.secondary },
      background: {
        default: themeColors.background,
        paper: themeColors.surface,
      },
      text: {
        primary: themeColors.text,
        secondary: themeColors.muted,
      },
      divider: themeColors.divider,
    },
    // shape: { borderRadius: 14 },
    typography: {
      fontFamily: "--font-inconsolata, --font-yu-gothic-bold, Arial, sans-serif",
      button: { textTransform: "none", fontWeight: 600 },
    }
  });
}