import { createTheme } from "@mui/material/styles";
import localFont from "next/font/local"

const inconsolata = localFont({ 
  src: "../fonts/Inconsolata-Medium.ttf", 
  variable: "--font-inconsolata"
});
const yugothicb = localFont({ 
  src: "../fonts/YuGothic-Bold-01.ttf", 
  variable: "--font-yu-gothic-bold"
});
const whitney = localFont({ 
  src: "../fonts/WHITNEY-MEDIUM.ttf", 
  variable: "--font-whitney"
});

const MonospaceFontFamily = `${inconsolata.style.fontFamily}, Consolas, 'Courier New', monospace`;
const DefaultFontFamily = `${whitney.style.fontFamily}, ${yugothicb.style.fontFamily}, sans-serif`;
const NoFontFamily = `${whitney.style.fontFamily}, sans-serif`;

declare module '@mui/material/styles' {
  interface Theme {
    custom: {
      "mainTabBackground": string;
      "listBackground1": string;
      "listBackground2": string;
    }
  }
  interface ThemeOptions {
    custom?: {
      "mainTabBackground"?: string;
      "listBackground1"?: string;
      "listBackground2"?: string;
    }
  }
}

export default function CreateTheme() {
  const themeColors = {
    primary: "#5090ffff",
    secondary: "#9c83ffff",
    surface: "#262626ff",
    background: "#141414ff",
    text: "#ffffffff",
    muted: "#babcc1ff",
    divider: "#ccccccff",
  } as const;
  return createTheme({
    custom: {
      mainTabBackground: "#242222ff",
      listBackground1: "#161616ff",
      listBackground2: "#302E2E",
    },
    palette: {
      mode: "dark",
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
      fontFamily: DefaultFontFamily,
      button: { textTransform: "none" },      
    }
  });
}

const theme = CreateTheme();
export { theme };
export { MonospaceFontFamily, DefaultFontFamily, NoFontFamily };

