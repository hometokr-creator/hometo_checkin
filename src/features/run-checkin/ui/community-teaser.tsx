"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  CHECKIN_INTEREST_TOPICS,
  recordCheckinInterest,
  type CheckinInterestEvent,
  type CheckinInterestRecord,
  type CheckinInterestTopic,
} from "@/domains/checkin";
import { BtnCta } from "@/shared/ui/btn-cta";
import { ChipNormal } from "@/shared/ui/chip-normal";

import { getCommunityInterestTitle } from "../model/community-interest";

interface CommunityTeaserProps {
  sessionId: string;
  // Supply only a verified aggregate. Undefined uses the non-numeric copy.
  interestHookPercent?: number;
}

export function CommunityTeaser({ sessionId, interestHookPercent }: CommunityTeaserProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const savingRef = useRef(false);
  const [record, setRecord] = useState<CheckinInterestRecord | null>(null);
  const [topics, setTopics] = useState<CheckinInterestTopic[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let started = false;
    const expose = () => {
      if (started) return;
      started = true;
      void recordCheckinInterest({ sessionId, type: "exposed" })
        .then((saved) => {
          if (!active) return;
          setRecord(saved);
          setTopics(saved.topics);
          setError(false);
        })
        .catch(() => { if (active) setError(true); });
    };
    const card = cardRef.current;
    const observer = typeof IntersectionObserver === "undefined" ? undefined :
      new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) expose();
      });
    if (observer && card) observer.observe(card);
    else expose();
    return () => { active = false; observer?.disconnect(); };
  }, [sessionId, attempt]);

  const save = async (event: CheckinInterestEvent) => {
    if (savingRef.current || !record) return;
    savingRef.current = true;
    setSaving(true);
    setError(false);
    try {
      setRecord(await recordCheckinInterest(event));
    } catch {
      setError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleTopic = (topic: CheckinInterestTopic) => {
    setTopics((selected) => selected.includes(topic)
      ? selected.filter((value) => value !== topic) : [...selected, topic]);
  };

  return (
    <section ref={cardRef} aria-labelledby={titleId}
      className="rounded-2xl border border-primary-100 bg-grayscale-0 p-5">
      <h2 id={titleId} className="text-headline-1 font-semibold text-grayscale-900">
        {getCommunityInterestTitle(interestHookPercent)}
      </h2>
      {record?.topicsSubmittedAt ? (
        <p className="mt-4 text-body-1 text-grayscale-800" role="status">
          고마워요! 준비되면 알려드릴게요 🙂
        </p>
      ) : record?.clicked ? (
        <div className="mt-4 grid gap-4">
          <p className="whitespace-pre-line text-body-1 text-grayscale-800" role="status">
            {"관심 가져주셔서 감사해요! 준비되면 가장 먼저 알려드릴게요 😊\n어떤 게 제일 궁금하세요? (여러 개 골라도 돼요)"}
          </p>
          <fieldset disabled={saving} className="flex flex-wrap gap-2">
            <legend className="sr-only">궁금한 주제 (여러 개 선택 가능)</legend>
            {CHECKIN_INTEREST_TOPICS.map((topic) => (
              <ChipNormal key={topic.value} selected={topics.includes(topic.value)}
                className="min-h-11 whitespace-normal focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                onClick={() => toggleTopic(topic.value)}>
                {topic.label}
              </ChipNormal>
            ))}
          </fieldset>
          <BtnCta size="l" className="w-full" loading={saving}
            onClick={() => void save({ sessionId, type: "topics-submitted", topics })}>
            선택 완료
          </BtnCta>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <p className="whitespace-pre-line text-body-1 text-grayscale-700">
            {"같은 홈투게더에서 지내는 다른 입주자들은 비슷한 순간을 어떻게 보내는지 —\n예를 들어 주방을 언제 쓰는지, 소음은 어떻게 조율하는지 —\n익명으로 물어보고 볼 수 있는 공간을 준비하고 있어요.\n관심 가져주시는 분이 많으면 더 빨리 만들어볼게요."}
          </p>
          <BtnCta size="l" className="h-auto min-h-[52px] w-full" loading={saving} disabled={!record}
            onClick={() => void save({ sessionId, type: "clicked" })}>
            궁금해요, 알려주세요
          </BtnCta>
        </div>
      )}
      {error && (
        <div className="mt-3 grid gap-2" role="alert">
          <p className="text-body-2 text-system-error">
            관심 내용을 저장하지 못했어요. 체크인 답변은 저장되어 있어요.
          </p>
          {record ? <p className="text-body-2">위 버튼을 눌러 다시 시도해 주세요.</p> : (
            <BtnCta variant="stroke" onClick={() => setAttempt((value) => value + 1)}>다시 시도</BtnCta>
          )}
        </div>
      )}
    </section>
  );
}
