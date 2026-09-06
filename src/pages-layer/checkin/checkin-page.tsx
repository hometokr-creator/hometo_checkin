import { resolveCheckinSession } from "@/domains/checkin";
import { CommunityTeaser, selectGuestScenario } from "@/features/run-checkin";
import { CheckinChat } from "@/widgets/checkin-chat";

import { CheckinStateScreen } from "./ui/checkin-state-screen";
import { RetryButton } from "./ui/retry-button";

interface CheckinPageProps {
  token: string;
}

export async function CheckinPage({ token }: CheckinPageProps) {
  const result = await resolveCheckinSession(token);

  switch (result.status) {
    case "active": {
      return (
        <CheckinChat
          session={result.session}
          scenario={selectGuestScenario(result.session)}
        />
      );
    }
    case "completed":
      return (
        <CheckinStateScreen
          title="이번 체크인은 이미 답변해 주셨어요"
          description="감사합니다 😊 이제 이 창을 닫으셔도 돼요."
          action={<CommunityTeaser key={result.sessionId} sessionId={result.sessionId} />}
        />
      );
    case "expired":
      return (
        <CheckinStateScreen
          title="이 체크인은 기간이 지났어요"
          description="다음 체크인 때 다시 뵐게요!"
        />
      );
    case "invalid":
      return (
        <CheckinStateScreen
          title="링크가 올바르지 않아요"
          description="카카오톡으로 받으신 링크로 다시 들어와 주세요."
          role="alert"
        />
      );
    case "error":
      return (
        <CheckinStateScreen
          title="일시적인 문제가 생겼어요"
          description="잠시 후 다시 시도해 주세요."
          action={<RetryButton />}
          role="alert"
        />
      );
  }
}
