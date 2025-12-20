import { Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { NoFontFamily } from "./Theme";
import { GetLocalizedString, Localization } from "../types/Localization";
import { CustomColors } from "../types/Consts";

type ChatMessage = {
  role: "me" | "peer" | "observer" | "system";
  sender: string;
  message: string;
}

export interface ChatBoxProps {
  messages: ChatMessage[];
  onSendMessage?: (message: string) => void;

}

export default function ChatBox({ 
  messages,
  onSendMessage
}: ChatBoxProps) {
  const [messageInput, setMessageInput] = useState<string>("");
  return <Stack spacing={0} direction="column" width="100%" >
    {messages.map((msg, index) => {
      return <Typography key={index} variant="body1"
        sx={{ width: "100%", wordBreak: "break-word", fontFamily: NoFontFamily }}
      >
        <strong style={{ color: msg.role === "me" 
            ? CustomColors.selfColor : msg.role === "peer" 
            ? CustomColors.opponentColor : msg.role === "observer"
            ? CustomColors.observerColor 
            : CustomColors.systemColor }}>
          {msg.sender}
        </strong>: {msg.message}
      </Typography>
    })}
    <TextField
      fullWidth
      variant="outlined"
      size="small"
      placeholder={GetLocalizedString(Localization.ChatMessageHint)}
      value={messageInput}
      sx={{
        width: "100%",
        paddingTop: 1,
      }}
      slotProps={{
        input: { sx: { fontFamily: NoFontFamily } },
        inputLabel: { sx: { fontFamily: NoFontFamily } },
      }}
      onChange={(e) => setMessageInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const target = e.target as HTMLInputElement;
          const message = target.value.trim();
          if (message && onSendMessage) {
            onSendMessage(message);
            target.value = "";
          }
          setMessageInput("");
        }
      }}
    />
  </Stack>
}

export type { ChatMessage };