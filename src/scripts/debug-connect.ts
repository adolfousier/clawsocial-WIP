#!/usr/bin/env npx tsx
import { ClawSocial } from '../src/index.js';

async function test() {
  const profile = process.argv[2] || 'https://www.linkedin.com/in/isroil-shafiev-157375238/';
  
  const claw = new ClawSocial({ browser: { headless: true } });
  await claw.initialize();
  
  const page = await claw.linkedin.getPage();
  await page.goto(profile);
  await page.waitForTimeout(5000);
  
  console.log('\n=== PAGE TITLE ===');
  console.log(await page.title());
  
  console.log('\n=== CHECKING PROFILE ACTION BUTTONS ===');
  
  // Check selectors
  const selectors = {
    'Connect (aria)': 'button[aria-label*="connect"], button[aria-label*="Connect"]',
    'Connect (text)': 'button:has-text("Connect"):not([aria-label*="Invite"])',
    'Follow': 'button[aria-label*="Follow"]:not([aria-label*="Following"]), button:has-text("Follow"):not(:has-text("Following"))',
    'Following': 'button[aria-label*="Following"]',
    'Message': 'button[aria-label*="Message"]',
    'Pending': 'button[aria-label*="Pending"]',
  };
  
  for (const [name, sel] of Object.entries(selectors)) {
    try {
      const count = await page.locator(sel).count();
      console.log(`${name}: ${count} matches`);
      if (count > 0) {
        const first = page.locator(sel).first();
        const text = await first.textContent();
        const ariaLabel = await first.getAttribute('aria-label');
        console.log(`  -> Text: "${text?.trim()}", aria-label: "${ariaLabel}"`);
      }
    } catch (e) {
      console.log(`${name}: ERROR`);
    }
  }
  
  await claw.shutdown();
}

test().catch(console.error);
