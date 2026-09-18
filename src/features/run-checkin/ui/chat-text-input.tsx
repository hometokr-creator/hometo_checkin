"use client";

import { useState, type FocusEvent, type FormEvent } from "react";

import { BtnCta } from "@/shared/ui/btn-cta";
import { TextArea } from "@/shared/ui/text-area";

interface ChatTextInputProps {
  maxLength: number;
  placeholder: string;
  skipLabel: string;
  submitLabel: string;
  onSubmit: (text: string) => void;
}

export function ChatTextInput({
  maxLength,
  placeholder,
  skipLabel,
  submitLabel,
  onSubmit,
}: ChatTextInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(text);
  };

  const handleFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <TextArea
        aria-label="추가로 전할 내용"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={handleFocus}
        maxLength={maxLength}
        placeholder={placeholder}
        showCount
      />
      <div className="grid grid-cols-2 gap-2">
        <BtnCta
          type="button"
          variant="stroke"
          size="l"
          className="w-full"
          onClick={() => onSubmit("")}
        >
          {skipLabel}
        </BtnCta>
        <BtnCta type="submit" size="l" className="w-full">
          {submitLabel}
        </BtnCta>
      </div>
    </form>
  );
}
