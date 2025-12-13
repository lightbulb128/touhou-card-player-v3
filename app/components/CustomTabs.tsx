import { Box } from "@mui/material";

export interface CustomTabsProps {
  activeTab: number;
  onChange: (newTabIndex: number) => void;
  innerTabs: React.ReactNode[];
}

export default function CustomTabs({
  activeTab, innerTabs
}: CustomTabsProps) {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        position: "relative",
        overflowX: "clip",
      }}
    >
      {innerTabs.map((tab, index) => (
        // Render every tab with a 100% width, but set the x-offset as needed so that
        // only the active tab is visible. Also use a transition for smooth sliding.
        <Box
          key={index}
          sx={{
            width: "100%",
            position: "absolute",
            transform: `translateX(${(index - activeTab) * 100}%)`,
            transition: "transform 0.3s ease-in-out",
            // backgroundColor: index % 2 === 0 ? "background.paper" : "background.default",
          }}
        >
          {tab}
        </Box>
      ))}
    </Box>
  )
}