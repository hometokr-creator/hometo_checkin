"use client";

import type { ChangeEvent, TextareaHTMLAttributes } from "react";
import { useId, useState } from "react";

import { cn } from "@/shared/lib/cn";

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label?: string;
  error?: string;
  showCount?: boolean;
}

export function TextArea({
  label,
  error,
  showCount = false,
  maxLength,
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  id,
  ...rest
}: TextAreaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const errorId = `${textareaId}-error`;
  const [innerLength, setInnerLength] = useState(String(defaultValue ?? "").length);
  const length = value != null ? String(value).length : innerLength;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setInnerLength(event.target.value.length);
    onChange?.(event);
  };

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      {label && (
        <label
          htmlFor={textareaId}
          className="w-full text-label-1 font-medium text-grayscale-600"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex h-32 w-full flex-col gap-2 rounded-lg border border-solid p-3 transition-colors",
          disabled
            ? "border-grayscale-300 bg-grayscale-100"
            : error
              ? "border-system-error bg-white"
              : "border-grayscale-300 bg-white focus-within:border-primary-500",
        )}
      >
        <textarea
          id={textareaId}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "min-h-0 w-full flex-1 resize-none bg-transparent text-body-1 font-medium outline-none",
            "placeholder:text-grayscale-400",
            disabled ? "text-grayscale-500" : "text-grayscale-800",
          )}
          {...rest}
        />
        {showCount && (
          <span className="w-full shrink-0 text-right text-label-2 text-grayscale-500">
            {length}/{maxLength ?? 1000}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className="w-full px-1 text-label-2 font-medium text-system-error">
          {error}
        </p>
      )}
    </div>
  );
}
