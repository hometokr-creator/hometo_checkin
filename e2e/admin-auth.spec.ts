import { test, expect } from "@playwright/test";

test("운영자 로그인은 비로그인 상태에서 열리며 이메일 입력을 안내한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "정기 체크인 운영자 로그인" })).toBeVisible();
  await expect(page.getByLabel("운영자 이메일")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인 링크 받기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/private/admin-login.png", fullPage: true });
});

test("운영자 페이지는 미인증 상태에서 로그인으로 이동한다", async ({ page, request }) => {
  for (const path of ["/admin", "/admin/responses", "/admin/stats"]) {
    const denied = await request.get(path, { maxRedirects: 0 });
    expect(denied.status()).toBe(303);
    expect(denied.headers()["cache-control"]).toContain("no-store");
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login$/);
  }
});

test("잘못된 매직링크는 새 링크 안내로 돌아간다", async ({ page }) => {
  await page.goto("/admin/auth/confirm");
  await expect(page).toHaveURL(/\/admin\/login\?error=link$/);
  await expect(page.getByRole("status")).toContainText("새 링크를 받아 주세요");
});
