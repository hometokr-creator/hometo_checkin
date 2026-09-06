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
    await expect(page.getByRole("textbox", { name: "추가로 전할 내용" })).toHaveValue("");
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

test("positive monthly answers end in the independent community interest flow", async ({ page }) => {
  const events: { type: string; clicked: boolean; topics: string[] }[] = [];
  page.on("console", async (message) => {
    if (message.text().startsWith("[mock:checkin-interest]")) {
      events.push(await message.args()[1].jsonValue());
    }
  });
  await page.goto("/c/demo-monthly");
  await expect(page.getByRole("button", { name: "궁금해요, 알려주세요" })).toHaveCount(0);
  await page.getByRole("button", { name: "네, 다 괜찮아요" }).click();
  await expect(page.getByText("다행이에요! 혹시 아주 사소하게라도 신경 쓰였던 건 없으셨어요?")).toBeVisible();
  await page.getByRole("button", { name: "그 외", exact: true }).click();
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: "이게 다예요" }).click();
  await expect(page.getByText("응답이 저장됐어요", { exact: false })).toBeVisible();
  const teaser = page.getByRole("region", { name: "나만 이런가? 다른 분들은 어떻게 지내는지 궁금하셨죠?" });
  await teaser.scrollIntoViewIfNeeded();
  await expect.poll(() => events.filter((event) => event.type === "exposed").length).toBe(1);
  expect(events[0].clicked).toBe(false);
  await teaser.getByRole("button", { name: "궁금해요, 알려주세요" }).click();
  await teaser.getByRole("button", { name: "주방·요리" }).click();
  await teaser.getByRole("button", { name: "청소·위생" }).click();
  await expect(teaser.getByRole("button", { name: "주방·요리" })).toHaveAttribute("aria-pressed", "true");
  await teaser.getByRole("button", { name: "선택 완료" }).click();
  await expect(teaser.getByText("고마워요! 준비되면 알려드릴게요 🙂")).toBeVisible();
  await expect.poll(() => events.length).toBe(3);
  expect(events[2].topics).toEqual(["kitchen", "cleaning"]);
  await expect(page.getByText("응답이 저장됐어요", { exact: false })).toHaveCount(1);
  await expect(page.getByRole("log").getByText("다음 달에 또 가볍게 여쭤볼게요", { exact: false })).toHaveCount(1);
});

test("already completed sessions can submit interest with no topic selected", async ({ page }) => {
  await page.goto("/c/demo-completed");
  await expect(page.getByRole("heading", { name: "이번 체크인은 이미 답변해 주셨어요" })).toBeVisible();
  await page.getByRole("button", { name: "궁금해요, 알려주세요" }).click();
  await page.getByRole("button", { name: "선택 완료" }).click();
  await expect(page.getByText("고마워요! 준비되면 알려드릴게요 🙂")).toBeVisible();
});

test("every supported guest round completes through text and offers community interest", async ({ page }) => {
  const cases = [
    { token: "demo-onboarding", label: "네, 잘 적응하고 있어요", regular: true },
    { token: "demo-monthly-first", label: "네, 잘 지냈어요", regular: true },
    { token: "demo-renewal", label: "지금은 괜찮아요", regular: true },
    { token: "demo-event-facility", label: "네, 이제 괜찮아요", regular: false },
    { token: "demo-event-rule", label: "네, 괜찮아요", regular: false },
  ];
  for (const entry of cases) {
    await page.goto(`/c/${entry.token}`);
    if (entry.token === "demo-renewal") await page.getByRole("button", { name: "계속 살고 싶어요" }).click();
    await page.getByRole("button", { name: entry.label, exact: true }).click();
    if (entry.regular) await page.getByRole("button", { name: "그 외", exact: true }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
    await page.getByRole("button", { name: "건너뛰기" }).click();
    if (entry.regular) await page.getByRole("button", { name: "이게 다예요" }).click();
    await expect(page.getByText("응답이 저장됐어요", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "궁금해요, 알려주세요" })).toBeVisible();
  }
});

for (const width of [320, 390]) {
  test(`mobile ${width}px renders local fonts, logo, urgent text and interest without overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 740 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/c/demo-monthly");
    await page.evaluate(() => document.fonts.ready);
    const font = await page.locator("body").evaluate((body) => getComputedStyle(body).fontFamily);
    expect(font).toMatch(/nanum/i);
    const logo = page.getByRole("log").locator("img").first();
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "불편한 게 있어요" }).click();
    await page.getByRole("button", { name: "안전·긴급" }).click();
    await page.screenshot({ path: testInfo.outputPath("urgent-chips.png") });
    await page.getByRole("button", { name: "그 외 (직접 입력)", exact: true }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
    await page.getByRole("textbox").fill("상황 설명입니다. 담당 매니저의 도움이 필요해요.");
    await page.screenshot({ path: testInfo.outputPath("urgent-text.png") });
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    const interest = page.getByRole("button", { name: "궁금해요, 알려주세요" });
    await interest.scrollIntoViewIfNeeded();
    await expect(interest).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("community-card.png") });
    await interest.click();
    await page.getByRole("button", { name: "집주인과 지내기" }).click();
    await page.screenshot({ path: testInfo.outputPath("community-topics.png") });
    const overflows = await page.locator("main").evaluate((main) => {
      const width = document.documentElement.clientWidth;
      return [...main.querySelectorAll("button, textarea, h1, h2")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < 0 || rect.right > width + 1;
      }).map((element) => element.textContent);
    });
    expect(overflows).toEqual([]);
    expect(errors).toEqual([]);
  });
}
