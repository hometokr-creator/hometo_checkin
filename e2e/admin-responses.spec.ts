import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

test.beforeAll(() => { execFileSync(process.execPath, ["scripts/build-admin-ui-fixture.mjs"], { windowsHide: true }); });
test.beforeEach(async ({ page }) => {
  await page.route("http://admin-ui.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/app.js" || path === "/app.css") {
      await route.fulfill({ contentType: path.endsWith("js") ? "text/javascript" : "text/css", body: await readFile(`artifacts/private/admin-ui${path}`) });
    } else {
      await route.fulfill({ contentType: "text/html", body: '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>' });
    }
  });
  await page.goto("http://admin-ui.test/");
});
test("목록 선택은 쓰지 않으며 수동 확인과 해제만 저장한다", async ({ page }) => {
  const list = page.getByRole("region", { name: "응답 목록" });
  await expect(list.getByRole("button").first()).toContainText("가상 이긴급");
  await expect(list).not.toContainText("010-");
  await list.getByRole("button", { name: /가상 김하나/ }).click();
  await expect(page.getByTestId("writes")).toHaveText("0");
  const detail = page.getByRole("article", { name: "응답 상세" });
  await expect(detail).toContainText("010-0000-0001");
  await expect(detail.getByRole("region", { name: "시설 불만" })).toContainText("두 번째 줄 원문");
  await expect(detail.getByRole("region", { name: "정산 불만" })).toContainText("설명 없이 태그만 선택함");
  await expect(detail).toContainText("처음엔 괜찮다고 함");
  await page.getByRole("button", { name: "확인함으로 표시", exact: true }).click();
  await expect(page.getByTestId("writes")).toHaveText("1");
  await expect(list.getByRole("button").first()).toContainText("가상 이긴급");
  await page.getByRole("button", { name: "확인 해제", exact: true }).click();
  await list.getByRole("button", { name: /가상 이긴급/ }).click();
  await list.getByRole("button", { name: /가상 김하나/ }).click();
  await expect(page.getByRole("button", { name: "확인함으로 표시", exact: true })).toBeVisible();
  await expect(page.getByTestId("writes")).toHaveText("2");
  await expect(page).toHaveURL("http://admin-ui.test/");
  await page.screenshot({ path: "artifacts/private/admin-responses.png", fullPage: true });
});
test("과거 이력은 현재 기간 밖도 표시하고 필터는 불만 없는 응답을 유지한다", async ({ page }) => {
  await page.getByRole("region", { name: "응답 목록" }).getByRole("button", { name: /가상 김하나/ }).click();
  await page.getByText("과거 응답 이력 · 1건", { exact: true }).click();
  await expect(page.getByRole("region", { name: /과거 응답 이력/ })).toContainText("지난달에도 문의했어요");
  await page.locator("summary").filter({ hasText: "필터 ·" }).click();
  await page.getByLabel("불만 유무").selectOption("no");
  await expect(page.getByRole("region", { name: "응답 목록" }).getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "응답 목록" })).toContainText("가상 박평온");
  await expect(page.getByRole("region", { name: "긴급 경로 진입 미제출" })).toContainText("가상 미제출");
  await expect(page.getByTestId("writes")).toHaveText("0");
});
test("저장 실패 시 확인 상태를 성공으로 바꾸지 않는다", async ({ page }) => {
  await page.goto("http://admin-ui.test/?fail=1");
  await page.getByRole("region", { name: "응답 목록" }).getByRole("button", { name: /가상 김하나/ }).click();
  await page.getByRole("button", { name: "확인함으로 표시", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("저장하지 못했습니다");
  await expect(page.getByRole("button", { name: "확인함으로 표시", exact: true })).toBeVisible();
  await expect(page.getByTestId("writes")).toHaveText("0");
});
test("진행 흐름은 글자 수만 표시하고 기록 누락을 숨기지 않는다", async ({ page }) => {
  const list = page.getByRole("region", { name: "응답 목록" });
  await list.getByRole("button", { name: /가상 김하나/ }).click();
  await expect(page.getByRole("button", { name: "확인함으로 표시", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "진행 흐름" })).not.toBeVisible();
  await page.getByText("진행 기록·관심 정보", { exact: true }).click();
  const timeline = page.getByRole("region", { name: "진행 흐름" });
  await expect(timeline).toContainText("작성함 32자");
  await expect(timeline).not.toContainText("난방이 잘 되지 않아요");
  await list.getByRole("button", { name: /가상 박평온/ }).click();
  await expect(page.getByRole("region", { name: "진행 흐름" })).not.toBeVisible();
  await page.getByText("진행 기록·관심 정보", { exact: true }).click();
  await expect(timeline).toContainText("진행 기록 없음");
});
test("작은 표본 통계는 분모를 표시하고 누락된 진행 기록으로 비율을 부풀리지 않는다", async ({ page }) => {
  await page.goto("http://admin-ui.test/stats");
  await expect(page.getByRole("article", { name: "설문 참여율", exact: true })).toContainText("2/3");
  await expect(page.getByRole("article", { name: "기록상 완주율", exact: true })).toContainText("1/2");
  await expect(page.getByRole("article", { name: "불만 설명 확보율", exact: true })).toContainText("1/2");
  for (const value of await page.getByTestId("ratio").allTextContents()) expect(value).not.toContain("%");
  await expect(page.getByRole("region", { name: "소요 시간", exact: true })).toContainText("1분 0초");
  await page.screenshot({ path: "artifacts/private/admin-stats.png", fullPage: true });
});
test("표본 10 이상에서는 백분율과 분모를 함께, 분모 0은 계산 불가로 표시한다", async ({ page }) => {
  await page.goto("http://admin-ui.test/stats?sample=10");
  await expect(page.getByRole("article", { name: "설문 참여율", exact: true })).toContainText("100% (10/10)");
  await page.goto("http://admin-ui.test/stats?sample=0");
  await expect(page.getByRole("article", { name: "설문 참여율", exact: true })).toContainText("계산 불가");
  await expect(page.getByRole("article", { name: "설문 참여율", exact: true })).not.toContainText("0%");
});
test("통계 회차 필터는 선택 회차를 다시 조회한다", async ({ page }) => {
  await page.goto("http://admin-ui.test/stats");
  await page.getByLabel("회차", { exact: true }).selectOption("monthly-first");
  await page.getByRole("button", { name: "통계 조회" }).click();
  await expect(page).toHaveURL(/round=monthly-first/);
  await expect(page.getByRole("article", { name: "설문 참여율", exact: true })).toContainText("계산 불가");
});
