import { expect, test } from "@playwright/test";

test.describe("guest check-in", () => {
  const roundCases = [
    ["demo-onboarding", "입주하신 지 일주일 정도 됐네요"],
    ["demo-monthly", "이번 달은 잘 지내셨어요?"],
    ["demo-monthly-first", "첫 한 달은 잘 보내셨어요?"],
    ["demo-renewal", "재계약에 대해 어떻게 생각하고 계세요?"],
    ["demo-event-facility", "지난번 말씀하신 에어컨은 확인해 보셨나요?"],
    ["demo-event-rule", "지난번 안내드린 생활 규칙은 확인하셨나요?"],
  ] as const;

  for (const [token, prompt] of roundCases) {
    test(`${token} loads its dedicated scenario`, async ({ page }) => {
      await page.goto(`/c/${token}`);
      await expect(page.getByRole("heading", { name: "정기 체크인" })).toBeVisible();
      await expect(page.getByText(prompt, { exact: false })).toBeVisible();
    });
  }

  test("collects at most two distinct monthly issues", async ({ page }) => {
    await page.goto("/c/demo-monthly");

    await page.getByRole("button", { name: "불편한 게 있어요" }).click();
    await page.getByRole("button", { name: "시설·수리" }).click();
    await page.getByRole("button", { name: "누수·물샘" }).click();
    await page.getByRole("textbox", { name: "추가로 전할 내용" }).fill("천장에서 물이 떨어져요");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await page.getByRole("button", { name: "네, 더 있어요" }).click();

    await expect(page.getByRole("button", { name: "시설·수리" })).toHaveCount(0);
    await page.getByRole("button", { name: "정산·비용" }).click();
    await page.getByRole("button", { name: "공과금이 이상해요" }).click();

    await expect(page.getByRole("textbox", { name: "추가로 전할 내용" })).toBeVisible();
    await expect(page.getByRole("button", { name: "네, 더 있어요" })).toHaveCount(0);
    await page.getByRole("button", { name: "건너뛰기" }).click();
    await expect(page.getByText("응답이 저장됐어요", { exact: false })).toBeVisible();
  });

  test("collects urgent detail and text without the additional issue loop", async ({ page }) => {
    await page.goto("/c/demo-monthly");

    await page.getByRole("button", { name: "불편한 게 있어요" }).click();
    await page.getByRole("button", { name: "안전·긴급" }).click();
    await page.getByRole("button", { name: "가스·누전" }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
    await page.getByRole("button", { name: "건너뛰기" }).click();

    await expect(page.getByText("바로 확인해서", { exact: false })).toBeVisible();
    await expect(page.getByText("응답이 저장됐어요", { exact: false })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });
});
