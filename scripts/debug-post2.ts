import { chromium } from 'playwright';
import * as fs from 'fs';

const cookies = JSON.parse(fs.readFileSync('./sessions/instagram.json', 'utf-8')).cookies;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  await context.addCookies(cookies);
  
  const page = await context.newPage();
  
  // First go to home to confirm session
  console.log('Going to home...');
  await page.goto('https://www.instagram.com/');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: './sessions/debug-home.png' });
  console.log('Home screenshot saved');
  
  // Now try the post with a wait
  console.log('Going to post...');
  await page.goto('https://www.instagram.com/p/DTqwmQhAET8/');
  await page.waitForTimeout(5000);
  
  // If error, click reload
  const reloadBtn = page.locator('button:has-text("Reload")');
  if (await reloadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Clicking reload...');
    await reloadBtn.click();
    await page.waitForTimeout(5000);
  }
  
  await page.screenshot({ path: './sessions/debug-post.png' });
  console.log('Post screenshot saved');
  
  // Check for like button with different selectors
  const selectors = [
    'svg[aria-label="Like"]',
    'svg[aria-label="Unlike"]', 
    '[aria-label="Like"]',
    'span[class*="like"]',
    'button[type="button"] svg',
    'section svg'
  ];
  
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    console.log(`${sel}: ${count}`);
  }
  
  await browser.close();
}

main().catch(console.error);
