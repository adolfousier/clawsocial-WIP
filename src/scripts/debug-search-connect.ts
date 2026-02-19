#!/usr/bin/env npx tsx
import { SocialCrabs } from '../src/index.js';

async function test() {
  const claw = new SocialCrabs({ browser: { headless: true } });
  await claw.initialize();
  
  const page = await claw.linkedin.getPage();
  
  // Search with 3rd+ degree filter (O = 3rd+)
  console.log('\n=== SEARCHING FOR 3RD+ DEGREE CONNECTIONS ===');
  await page.goto('https://www.linkedin.com/search/results/people/?keywords=blockchain%20engineer&network=%5B"O"%5D&origin=FACETED_SEARCH');
  await page.waitForTimeout(5000);
  
  console.log('Page:', await page.title());
  
  // Get profiles
  const profileUrls = await page.$$eval('a[href*="/in/"]', 
    links => [...new Set(links.map(a => {
      const href = a.getAttribute('href');
      const match = href?.match(/\/in\/([^/?]+)/);
      return match ? match[1] : null;
    }).filter(Boolean))]
  );
  
  console.log(`Found ${profileUrls.length} profiles`);
  
  // Test first 5 profiles
  for (const username of profileUrls.slice(0, 8)) {
    const url = `https://www.linkedin.com/in/${username}/`;
    console.log(`\nTesting: ${username}`);
    
    await page.goto(url);
    await page.waitForTimeout(3000);
    
    const hasMessage = await page.locator('button[aria-label*="Message"]').count();
    
    if (hasMessage === 0) {
      console.log(`  ✅ NOT CONNECTED!`);
      
      // Now let's test the actual connect function
      console.log(`\n=== ATTEMPTING CONNECTION ===`);
      
      // Use the actual SocialCrabs connect
      await claw.shutdown();
      
      // Re-init and test
      const claw2 = new SocialCrabs({ browser: { headless: true } });
      await claw2.initialize();
      
      const result = await claw2.linkedin.connect({ profileUrl: url });
      console.log('Result:', result);
      
      await claw2.shutdown();
      return;
    } else {
      console.log(`  ❌ Already connected`);
    }
  }
  
  console.log('\n❌ Could not find unconnected profile');
  await claw.shutdown();
}

test().catch(console.error);
