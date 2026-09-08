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
  await expect(page.getByRole("region", { name: /과거 응답 이력/ })).toContainText("지난달에도 문의했어요");
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
