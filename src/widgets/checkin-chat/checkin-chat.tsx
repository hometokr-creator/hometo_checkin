"use client";

import type { CheckinSession } from "@/domains/checkin";
import {
  ChatBubble,
  CommunityTeaser,
  useCheckinMachine,
  type Scenario,
} from "@/features/run-checkin";
import { BtnCta } from "@/shared/ui/btn-cta";

import { ChatScroll } from "./chat-scroll";
import { CheckinControl } from "./checkin-control";

interface CheckinChatProps {
  session: CheckinSession;
  scenario: Scenario;
}

export function CheckinChat({ session, scenario }: CheckinChatProps) {
  const {
    state,
    currentStep,
    selectOption,
    selectTag,
    selectDetail,
    submitText,
    retrySubmit,
  } = useCheckinMachine({ session, scenario });

  return (
    <main className="flex h-svh min-h-[480px] flex-col bg-grayscale-70">
      <header className="shrink-0 border-b border-grayscale-200 bg-grayscale-0 px-5 py-4">
        <div className="mx-auto w-full max-w-[480px]">
          <p className="text-caption-1 font-medium text-primary-600">
            홈투게더
          </p>
          <h1 className="text-headline-1 font-semibold text-grayscale-900">
            정기 체크인
          </h1>
        </div>
      </header>

      <ChatScroll messageCount={state.transcript.length}>
        {state.transcript.map((message) => (
          <ChatBubble
            key={message.id}
            role={message.role}
            text={message.text}
          />
        ))}
        {state.status === "completed" && (
          <CommunityTeaser key={session.id} sessionId={session.id} />
        )}
      </ChatScroll>

      <section className="shrink-0 border-t border-grayscale-200 bg-grayscale-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[480px]">
          {state.status === "active" && currentStep && (
            <CheckinControl
              step={currentStep}
              answers={state.answers}
              onSelectOption={selectOption}
              onSelectTag={selectTag}
              onSelectDetail={selectDetail}
              onSubmitText={submitText}
            />
          )}
          {state.status === "submitting" && (
            <p
              className="py-3 text-center text-body-2 text-grayscale-600"
              role="status"
            >
              답변을 저장하고 있어요…
            </p>
          )}
          {state.status === "completed" && (
            <p
              className="py-3 text-center text-body-2 text-grayscale-600"
              role="status"
            >
              응답이 저장됐어요. 이제 이 창을 닫으셔도 돼요.
            </p>
          )}
          {state.status === "error" && (
            <div role="alert">
              <p className="mb-3 text-center text-body-2 text-system-error">
                {state.errorCode === "expired"
                  ? "응답 기간이 지나 저장할 수 없어요."
                  : state.errorCode === "conflict"
                    ? "다른 창에서 이미 응답을 제출했어요. 다시 접속해 주세요."
                    : state.errorCode === "invalid"
                      ? "접근이 만료됐어요. 안내받은 링크로 다시 접속해 주세요."
                      : state.errorCode === "invalid-answer"
                        ? "응답을 확인할 수 없어요. 안내받은 링크로 다시 접속해 주세요."
                        : "답변을 저장하지 못했어요. 입력한 내용은 그대로 보관하고 있어요."}
              </p>
              {![
                "expired",
                "conflict",
                "invalid",
                "invalid-answer",
                "unsupported",
              ].includes(state.errorCode ?? "") && (
                <BtnCta className="w-full" size="l" onClick={retrySubmit}>
                  다시 시도
                </BtnCta>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
