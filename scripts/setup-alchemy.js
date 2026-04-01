import { chromium } from "playwright";

const EMAIL    = "rourkie2o16@gmail.com";
const PASSWORD = "OmniService2026!Xk9";

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();

try {
  await page.goto("https://auth.alchemy.com/signup");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  await page.locator("#given_name").fill("JL");
  await page.locator("#family_name").fill("Omni");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.waitForTimeout(1000);

  // Press Enter to submit instead of clicking hidden button
  await page.locator("#password").press("Enter");
  await page.waitForTimeout(6000);

  console.log("[Alchemy] After submit URL:", page.url());
  await page.screenshot({ path: "/tmp/alchemy-after.png" });

  const body = await page.textContent("body");
  console.log("[Alchemy] Page text:", body.slice(0, 600));

} catch (e) {
  console.error("[Alchemy] Error:", e.message);
  await page.screenshot({ path: "/tmp/alchemy-error.png" });
} finally {
  await browser.close();
}
