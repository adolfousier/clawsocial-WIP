import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

async function main() {
  const sessionPath = path.join(SESSIONS_DIR, 'linkedin.json');
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  await context.addCookies(session.cookies);
  
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/search/results/all/?keywords=openclaw', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  // Save HTML
  const html = await page.content();
  fs.writeFileSync('./scraped/linkedin-page.html', html);
  console.log('HTML saved: ' + html.length + ' chars');
  
  // Find all unique class names containing 'update', 'post', 'feed', 'result'
  const classes = await page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    const classSet = new Set<string>();
    allElements.forEach(el => {
      el.classList.forEach(c => {
        if (c.includes('update') || c.includes('post') || c.includes('feed') || c.includes('result') || c.includes('article')) {
          classSet.add(c);
        }
      });
    });
    return Array.from(classSet).sort();
  });
  
  console.log('\nRelevant classes found:');
  classes.forEach(c => console.log('  .' + c));
  
  // Count specific elements
  const counts = await page.evaluate(() => {
    return {
      'div[data-urn]': document.querySelectorAll('div[data-urn]').length,
      '.update-components-text': document.querySelectorAll('.update-components-text').length,
      '.feed-shared-update-v2': document.querySelectorAll('.feed-shared-update-v2').length,
      'article': document.querySelectorAll('article').length,
      '.entity-result': document.querySelectorAll('.entity-result').length,
      '.search-result': document.querySelectorAll('.search-result').length,
      '.occludable-update': document.querySelectorAll('.occludable-update').length,
      '[class*="result"]': document.querySelectorAll('[class*="result"]').length,
    };
  });
  
  console.log('\nElement counts:');
  Object.entries(counts).forEach(([sel, count]) => console.log(`  ${sel}: ${count}`));
  
  await browser.close();
}

main().catch(console.error);
