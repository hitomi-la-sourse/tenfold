import { expect, test } from "@playwright/test";

test("招待リンクで2人がオンラインルームに参加して対戦を始められる", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("./");
  await host.getByRole("button", { name: "オンライン対戦" }).click();
  await host.getByLabel("ニックネーム").fill("主催者");
  await host.getByRole("button", { name: /新しいルームを作る/ }).click();

  const roomCode = await host.locator(".room-code-panel strong").textContent();
  expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);

  await guest.goto(`./?room=${roomCode}`);
  await guest.getByLabel("ニックネーム").fill("参加者");
  await guest.getByRole("button", { name: "ルームに参加" }).click();

  await expect(host.getByText("参加者", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText("主催者", { exact: true })).toBeVisible({ timeout: 20_000 });

  await host.getByRole("button", { name: "対戦を始める" }).click();
  await expect(host.getByRole("region", { name: "TENFOLD 対戦画面" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(guest.getByRole("region", { name: "TENFOLD 対戦画面" })).toBeVisible({
    timeout: 20_000,
  });

  await hostContext.close();
  await guestContext.close();
});
