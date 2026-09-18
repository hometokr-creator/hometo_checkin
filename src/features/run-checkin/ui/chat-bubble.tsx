import { cn } from "@/shared/lib/cn";

import { ChatAvatar } from "./chat-avatar";

interface ChatBubbleProps {
  role: "bot" | "user";
  text: string;
}

export function ChatBubble({ role, text }: ChatBubbleProps) {
  const isBot = role === "bot";

  return (
    <div className={cn("flex items-end gap-2", isBot ? "justify-start" : "justify-end")}>
      {isBot && <ChatAvatar />}
      <p
        className={cn(
          "max-w-[78%] whitespace-pre-line rounded-2xl px-4 py-3 text-body-1 shadow-sm",
          isBot
            ? "rounded-bl-md bg-grayscale-100 text-grayscale-900"
            : "rounded-br-md bg-primary-500 text-white",
        )}
      >
        {text}
      </p>
    </div>
  );
}

