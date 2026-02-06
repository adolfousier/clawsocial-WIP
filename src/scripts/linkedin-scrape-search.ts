import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const OUTPUT_FILE = path.join(__dirname, '..', 'scraped', 'linkedin-openclaw-search.json');

interface LinkedInPost {
  author: string;
  authorUrl: string;
  content: string;
  postUrl: string;
  likes?: string;
  comments?: string;
  reposts?: string;
  timestamp?: string;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function humanScroll(page: any) {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  let currentPosition = 0;
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  
  while (currentPosition < scrollHeight) {
    // Random scroll amount (200-400px)
    const scrollAmount = Math.floor(Math.random() * 200) + 200;
    currentPosition += scrollAmount;
    
    await page.evaluate((pos: number) => window.scrollTo({ top: pos, behavior: 'smooth' }), currentPosition);
    
    // Random delay between scrolls (500-1500ms)
    await delay(Math.floor(Math.random() * 1000) + 500);
    
    // Check for new content loaded
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight > scrollHeight) {
      console.log(`New content loaded, height: ${newHeight}`);
    }
  }
  
  // Final pause at bottom
  await delay(2000);
}

async function loadSession(): Promise<any[]> {
  const sessionPath = path.join(SESSIONS_DIR, 'linkedin.json');
  if (!fs.existsSync(sessionPath)) {
    throw new Error('LinkedIn session not found. Please login first.');
  }
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  return session.cookies || [];
}

async function scrapeSearchResults(page: any): Promise<LinkedInPost[]> {
  const posts: LinkedInPost[] = [];
  
  // Wait a bit for content to be fully rendered
  await delay(2000);
  
  // Get all post containers using broader selectors
  const items = await page.$$('div[data-urn*="activity"], .feed-shared-update-v2, .occludable-update');
  
  console.log(`Found ${items.length} items using primary selector`);
  
  // If no items found, try alternate approach
  if (items.length === 0) {
    // Try getting from page structure directly
    const pageHtml = await page.content();
    console.log(`Page has ${pageHtml.length} chars. Looking for posts...`);
    
    // Look for post patterns in HTML
    const postMatches = pageHtml.match(/data-urn="urn:li:activity:[^"]+"/g);
    console.log(`Found ${postMatches?.length || 0} post URNs in HTML`);
  }
  
  for (const item of items) {
    try {
      // Get author info from the actor component
      const authorName = await item.$eval(
        '.update-components-actor__title span[aria-hidden="true"], .feed-shared-actor__name span',
        (el: Element) => el.textContent?.trim() || ''
      ).catch(() => '');
      
      const authorUrl = await item.$eval(
        '.update-components-actor__container-link, .feed-shared-actor__container-link',
        (el: Element) => el.getAttribute('href') || ''
      ).catch(() => '');
      
      // Get post content
      const content = await item.$eval(
        '.feed-shared-text__text-view, .update-components-text, .break-words span[dir="ltr"]',
        (el: Element) => el.textContent?.trim() || ''
      ).catch(() => '');
      
      // Get post URN/URL
      const postUrn = await item.getAttribute('data-urn').catch(() => '');
      const activityId = postUrn?.match(/activity:(\d+)/)?.[1];
      const postUrl = activityId ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}` : '';
      
      // Get engagement
      const likes = await item.$eval(
        '.social-details-social-counts__reactions-count',
        (el: Element) => el.textContent?.trim()
      ).catch(() => undefined);
      
      const comments = await item.$eval(
        'button[aria-label*="comment"] span, .social-details-social-counts__comments',
        (el: Element) => el.textContent?.trim()
      ).catch(() => undefined);
      
      if (authorName || content) {
        posts.push({
          author: authorName,
          authorUrl: authorUrl.startsWith('/') ? `https://www.linkedin.com${authorUrl}` : authorUrl,
          content: content.substring(0, 500),
          postUrl,
          likes,
          comments
        });
      }
    } catch (e) {
      continue;
    }
  }
  
  return posts;
}

async function main() {
  console.log('🔍 LinkedIn OpenClaw Search Scraper');
  console.log('===================================\n');
  
  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const cookies = await loadSession();
  console.log(`✅ Loaded ${cookies.length} cookies from session\n`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  await context.addCookies(cookies);
  
  const page = await context.newPage();
  
  try {
    const searchUrl = 'https://www.linkedin.com/search/results/all/?keywords=openclaw&origin=GLOBAL_SEARCH_HEADER';
    console.log(`📄 Navigating to: ${searchUrl}\n`);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for page to stabilize
    await delay(3000);
    
    // Save debug screenshot
    await page.screenshot({ path: path.join(outputDir, 'linkedin-debug.png') });
    console.log('📸 Debug screenshot saved\n');
    
    // Check if logged in - look for profile icon or search results
    const isLoggedIn = await page.$('.global-nav__me-photo, .search-results-container, .artdeco-card, [data-view-name="search-entity-result-universal-template"]');
    const hasLoginPrompt = await page.$('input#username, .login__form, [data-test-id="login-form"]');
    
    if (hasLoginPrompt || !isLoggedIn) {
      // Double check by looking at page content
      const pageContent = await page.content();
      if (pageContent.includes('Sign in') && pageContent.includes('Join now')) {
        console.log('⚠️ Not logged in or session expired');
        console.log('Check screenshot at: scraped/linkedin-debug.png');
        await browser.close();
        return;
      }
    }
    console.log('✅ Session valid, logged in\n');
    
    // Human-like scroll to load all content
    console.log('📜 Scrolling to load all results...\n');
    await humanScroll(page);
    
    // Scrape the results
    console.log('🔎 Scraping search results...\n');
    const posts = await scrapeSearchResults(page);
    
    console.log(`\n✅ Scraped ${posts.length} posts/results\n`);
    
    // Save results
    const output = {
      query: 'openclaw',
      scrapedAt: new Date().toISOString(),
      count: posts.length,
      results: posts
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`💾 Saved to: ${OUTPUT_FILE}\n`);
    
    // Preview first 5
    console.log('📋 Preview (first 5 results):');
    console.log('─'.repeat(50));
    posts.slice(0, 5).forEach((p, i) => {
      console.log(`${i + 1}. ${p.author || 'Unknown'}`);
      console.log(`   ${p.content.substring(0, 100)}...`);
      console.log(`   URL: ${p.postUrl || 'N/A'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    // Take screenshot for debugging
    await page.screenshot({ path: path.join(outputDir, 'linkedin-scrape-error.png') });
    console.log('📸 Screenshot saved for debugging');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
