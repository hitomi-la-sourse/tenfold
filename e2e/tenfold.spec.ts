import { expect, test, type Page } from "@playwright/test";

async function startCpuGame(page: Page): Promise<void> {
  await page.goto("/play/cpu");
  await expect(page.getByLabel("ニックネーム")).toHaveValue("旅人");
  await page.getByLabel("ニックネーム").fill("E2E旅人");
  await page.getByRole("button", { name: "対戦を始める" }).click();
  await expect(page.getByRole("region", { name: "TENFOLD 対戦画面" })).toBeVisible();
  await expect(page.getByText("YOUR HAND")).toBeVisible();
}

async function makeOneChoice(page: Page): Promise<boolean> {
  const result = page.getByRole("dialog", { name: /勝利|引き分け/ });
  if (await result.isVisible().catch(() => false)) return true;

  const card = page.locator(".hand-cards button.game-card:not([disabled])").first();
  if (await card.isVisible().catch(() => false)) {
    await card.click();
  } else {
    const sage = page.locator(".choice-cards button.game-card").first();
    const target = page.locator(".target-list button").first();
    const guess = page.locator(".rank-picker button").first();
    const execution = page.locator(".compact-choice button.game-card").first();
    const death = page.locator(".death-choice > button").first();
    const candidates = [sage, target, guess, execution, death];
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        break;
      }
    }
  }
  const confirm = page.getByRole("button", { name: "この選択で確定" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  return false;
}

test("CPU戦を開始してカードを出せる", async ({ page }) => {
  await startCpuGame(page);
  const legalCard = page.locator(".hand-cards button.game-card:not([disabled])").first();
  await expect(legalCard).toBeVisible();
  await legalCard.click();
  await page.getByRole("button", { name: "この選択で確定" }).click();
  expect(await page.locator(".game-log li").count()).toBeGreaterThanOrEqual(3);
});

test("2人がルーム参加から決着・再戦まで進める", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/room/new");
  await expect(host.getByLabel("ニックネーム")).toHaveValue("旅人");
  await host.getByLabel("ニックネーム").fill("アオイ");
  await host.getByRole("button", { name: "ルームを作る" }).click();
  await expect(host).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{6}$/);
  const code = (await host.locator(".room-code-panel > strong").innerText()).trim();

  await guest.goto("/room/join");
  await expect(guest.getByLabel("ニックネーム")).toHaveValue("旅人");
  await guest.getByLabel("ニックネーム").fill("レン");
  await guest.getByLabel("ルームコード").fill(code);
  await guest.getByRole("button", { name: "ルームへ参加" }).click();
  await expect(guest).toHaveURL(new RegExp(`/room/${code}$`));
  await expect(host.getByText("2/4", { exact: true })).toBeVisible();

  await host.getByRole("button", { name: "対戦を始める" }).click();
  await expect(host.getByRole("region", { name: "TENFOLD 対戦画面" })).toBeVisible();
  await expect(guest.getByRole("region", { name: "TENFOLD 対戦画面" })).toBeVisible();

  for (let step = 0; step < 160; step += 1) {
    const hostDone = await makeOneChoice(host);
    const guestDone = await makeOneChoice(guest);
    if (hostDone || guestDone) break;
    await host.waitForTimeout(70);
  }

  await expect(host.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
  await host.getByRole("button", { name: "再戦する" }).click();
  await expect(host.getByRole("dialog")).toBeHidden();
  await expect(host.getByText("TURN 1", { exact: true })).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
