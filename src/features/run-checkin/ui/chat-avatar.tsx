import Image from "next/image";

import { cn } from "@/shared/lib/cn";

interface ChatAvatarProps {
  className?: string;
}

export function ChatAvatar({ className }: ChatAvatarProps) {
  return (
    <div
      className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100", className)}
      aria-hidden="true"
    >
      <Image src="/logos/logo_avatar_256.png" alt="" width={48} height={48}
        sizes="48px" className="size-full object-contain" />
    </div>
  );
}
