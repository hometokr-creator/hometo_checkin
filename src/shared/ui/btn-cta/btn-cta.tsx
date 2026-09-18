import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export type BtnCtaVariant = "default" | "emphasize" | "sub" | "stroke" | "kakao";
export type BtnCtaSize = "xs" | "s" | "m" | "l" | "xl" | "mobile" | "pill";
export type BtnCtaShape = "rect" | "pill";

export interface BtnCtaProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Figma: btn_cta / Property 1 (defualt · emphasize · sub · stroke).
   * `kakao`는 컴포넌트 셋에는 없고 로그인 화면에서만 쓰는 카카오 브랜드 색입니다.
   * disabled 상태는 disabled prop으로 처리합니다.
   */
  variant?: BtnCtaVariant;
  /** Figma: btn_cta / size */
  size?: BtnCtaSize;
  /** 데스크톱 로그인 화면처럼 완전한 알약 형태가 필요할 때 사용 */
  shape?: BtnCtaShape;
  /** Figma: left_ic — ic_variant 슬롯. 프로젝트 아이콘을 그대로 넣어 사용 */
  leftIcon?: ReactNode;
  /** Figma: right_ic — ic_variant 슬롯 */
  rightIcon?: ReactNode;
  /**
   * 비동기 처리 중 표시. leftIcon 자리에 스피너를 띄우고 버튼을 강제로 disabled +
   * aria-busy 처리합니다. size별 아이콘 크기·버튼 높이가 고정이라 레이아웃은 유지됩니다.
   */
  loading?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center text-center font-semibold transition-opacity disabled:cursor-not-allowed";

const sizeClasses: Record<BtnCtaSize, string> = {
  xs: "gap-1 rounded-lg px-4 py-2 text-label-2",
  s: "h-[46px] gap-2 rounded-[10px] px-6 pt-3 pb-3 text-label-1",
  m: "h-12 gap-2 rounded-xl px-6 py-3 text-label-1",
  l: "h-[52px] gap-3 rounded-xl px-6 py-3.5 text-body-1",
  xl: "gap-3 rounded-xl px-6 py-4 text-body-1",
  mobile: "h-12 gap-3 rounded-xl px-6 py-3 text-body-1",
  /** 데스크톱 로그인 화면 전용 (Figma 643:19331 — h58 · px36 · 17px Bold) */
  pill: "h-[58px] gap-3 rounded-full px-9 py-4 text-headline-2 font-bold",
};

const iconSize: Record<BtnCtaSize, string> = {
  xs: "[&_svg]:size-4 [&_img]:size-4",
  s: "[&_svg]:size-[18px] [&_img]:size-[18px]",
  m: "[&_svg]:size-5 [&_img]:size-5",
  l: "[&_svg]:size-6 [&_img]:size-6",
  xl: "[&_svg]:size-6 [&_img]:size-6",
  mobile: "[&_svg]:size-5 [&_img]:size-5",
  pill: "[&_svg]:size-6 [&_img]:size-6",
};

const variantClasses: Record<BtnCtaVariant, string> = {
  default:
    "bg-primary-600 text-white hover:opacity-80 disabled:bg-grayscale-200 disabled:text-grayscale-400 disabled:hover:opacity-100",
  emphasize:
    "bg-grayscale-800 text-white hover:opacity-80 disabled:bg-grayscale-200 disabled:text-grayscale-400 disabled:hover:opacity-100",
  sub: "bg-primary-100 text-primary-500 hover:opacity-80 disabled:bg-grayscale-200 disabled:text-grayscale-400 disabled:hover:opacity-100",
  stroke:
    "border border-grayscale-300 bg-transparent text-grayscale-600 hover:opacity-80 disabled:border-transparent disabled:bg-grayscale-200 disabled:text-grayscale-400 disabled:hover:opacity-100",
  kakao:
    "bg-system-kakao text-grayscale-900 hover:opacity-80 disabled:bg-grayscale-200 disabled:text-grayscale-400 disabled:hover:opacity-100",
};

/**
 * 시각적으로만 비활성인 상태 (aria-disabled)
 *
 * 필수 입력을 건너뛰고 눌렀을 때 안내 토스트를 띄우려면 클릭 이벤트가 살아 있어야
 * 해서, disabled 대신 aria-disabled를 쓰는 화면이 있습니다. 그 경우에도 같은
 * 비활성 스타일이 적용되도록 컴포넌트가 직접 처리합니다.
 */
const ariaDisabledClasses =
  "bg-grayscale-200 text-grayscale-400 border-transparent hover:opacity-100";

/** 로딩 스피너 — 버튼 텍스트 색(currentColor)을 따르고, iconSize의 [&_svg] 규칙으로 크기가 잡힙니다 */
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * CTA 버튼 (Figma: btn_cta, node 133:839)
 *
 * - variant × size 조합은 Figma 컴포넌트 셋의 변형과 1:1 대응
 * - hover 변형은 CSS :hover(opacity 80%)로 구현 (Figma 주석 "26.7.12 호버추가")
 * - Figma의 고정 너비(154/196/335/398/492px)는 인스턴스 예시 값이므로
 *   기본은 내용 너비, 필요 시 className="w-full" 등으로 지정
 *
 * className으로 넘긴 유틸리티는 Tailwind의 출력 순서에 따라 기본 스타일에 밀릴 수
 * 있습니다. 색을 바꿔야 하면 variant를 쓰거나 `bg-white!`처럼 important를 붙이세요.
 */
export function BtnCta({
  variant = "default",
  size = "m",
  shape,
  leftIcon,
  rightIcon,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: BtnCtaProps) {
  const visuallyDisabled = rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  // 로딩 중에는 클릭을 막아야 하므로 disabled를 강제합니다(disabled:* 스타일도 함께 적용됩니다).
  const isDisabled = disabled || loading;

  const classes = cn(
    base,
    sizeClasses[size],
    iconSize[size],
    visuallyDisabled ? ariaDisabledClasses : variantClasses[variant],
    variant === "stroke" && size === "mobile" && "font-medium",
    shape === "pill" && "rounded-full",
    shape === "rect" && size === "pill" && "rounded-xl",
    className,
  );

  const left = loading ? <Spinner /> : leftIcon;

  return (
    <button
      type="button"
      className={classes}
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
    >
      {left && <span className="inline-flex shrink-0 items-center justify-center">{left}</span>}
      <span className="[word-break:break-word] whitespace-nowrap">{children}</span>
      {rightIcon && (
        <span className="inline-flex shrink-0 items-center justify-center">{rightIcon}</span>
      )}
    </button>
  );
}
