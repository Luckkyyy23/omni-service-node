import { chromium } from "playwright";
import crypto from "crypto";

const EMAIL    = "rourkie2o16@gmail.com";
const PASSWORD = "OmniNode2026!$" + crypto.randomBytes(4).toString("hex");

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();

console.log("[Alchemy] Opening signup...");
await page.goto("https://auth.alchemy.com/signup");
await page.waitForTimeout(4000);
console.log("[Alchemy] URL:", page.url());

// Check if signup requires phone or just email
const inputs = await page.$$eval("input", els =>
  els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder, id: e.id }))
);
console.log("[Alchemy] Fields:", JSON.stringify(inputs));

await browser.close();
console.log("[Alchemy] Done");
