import { expect, test } from "@playwright/test";

test("公開ページからサーバー同期版オンライン対戦へ移動できる", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("link", { name: /オンライン対戦/ })).toHaveAttribute(
    "href",
    "https://tenfold-card-game.leafy-knoll-5739.chatgpt.site/play",
  );
});
