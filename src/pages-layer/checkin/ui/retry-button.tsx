"use client";

import { BtnCta } from "@/shared/ui/btn-cta";

export function RetryButton() {
  return (
    <BtnCta className="w-full" size="l" onClick={() => window.location.reload()}>
      다시 시도
    </BtnCta>
  );
}
