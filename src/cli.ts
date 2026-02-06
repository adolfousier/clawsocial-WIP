#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { ClawSocial } from './index.js';
import type { Platform, ActionType, NotificationPayload } from './types/index.js';

// Default retry configuration
const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds between retries

/**
 * Parse --context JSON flag and merge with action result
 */
function parseContext(contextStr?: string): Record<string, unknown> | undefined {
  if (!contextStr) return undefined;
  try {
    return JSON.parse(contextStr);
  } catch {
    console.error('Invalid --context JSON:', contextStr);
    return undefined;
  }
}

/**
 * Retry wrapper for actions
 */
async function withRetry<T>(
  action: () => Promise<T>,
  options: {
    retries: number;
    actionName: string;
    target: string;
  }
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < options.retries) {
        console.log(`⚠️ Attempt ${attempt}/${options.retries} failed for ${options.actionName} (${options.target})`);
        console.log(`   Error: ${lastError.message}`);
        console.log(`   Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  
  throw lastError;
}

/**
 * Parse retries option, default to DEFAULT_RETRIES
 */
function parseRetries(retriesStr?: string): number {
  if (!retriesStr) return DEFAULT_RETRIES;
  const n = parseInt(retriesStr, 10);
  return isNaN(n) ? DEFAULT_RETRIES : Math.max(1, Math.min(n, 10)); // Clamp 1-10
}

/**
 * Send notification with merged context (used when --context is provided)
 */
async function sendNotificationWithContext(
  claw: ClawSocial,
  platform: Platform,
  action: ActionType,
  success: boolean,
  target: string,
  context?: Record<string, unknown>,
  error?: string
): Promise<void> {
  const notifier = claw.notifier;
  if (!notifier.isEnabled()) return;
  
  const payload: NotificationPayload = {
    event: success ? 'action:complete' : 'action:error',
    platform,
    action,
    success,
    target,
    error,
    details: context,
    timestamp: Date.now(),
  };
  
  await notifier.notify(payload);
}

const program = new Command();

program
  .name('clawsocial')
  .description('Production-ready social media automation with human-like behavior')
  .version('1.0.0');

// ============================================================================
// Server command
// ============================================================================

program
  .command('serve')
  .description('Start the ClawSocial server')
  .option('-p, --port <port>', 'HTTP port', '3847')
  .option('-w, --ws-port <port>', 'WebSocket port', '3848')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser with visible window')
  .action(async (options) => {
    try {
      const claw = new ClawSocial({
        server: {
          port: parseInt(options.port, 10),
          wsPort: parseInt(options.wsPort, 10),
          host: options.host,
        },
        browser: {
          headless: options.headless,
        },
      });

      await claw.initialize();
      await claw.startServer();

      console.log(`\n🦞 ClawSocial server running`);
      console.log(`   HTTP: http://${options.host}:${options.port}`);
      console.log(`   WS:   ws://${options.host}:${options.wsPort}`);
      console.log(`\nPress Ctrl+C to stop\n`);
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Session commands
// ============================================================================

const session = program.command('session').description('Manage login sessions');

session
  .command('login <platform>')
  .description('Login to a platform (instagram, twitter, linkedin)')
  .option('--headless', 'Run in headless mode (reads credentials from env)')
  .option('-u, --username <username>', 'Username/email (or set PLATFORM_USERNAME env)')
  .option('-p, --password <password>', 'Password (or set PLATFORM_PASSWORD env)')
  .action(async (platform: Platform, options) => {
    try {
      // Get credentials from options or environment
      const envPrefix = platform.toUpperCase();
      const username = options.username || process.env[`${envPrefix}_USERNAME`] || process.env[`${envPrefix}_EMAIL`];
      const password = options.password || process.env[`${envPrefix}_PASSWORD`];
      
      const headless = options.headless === true || !!(username && password);
      
      const claw = new ClawSocial({
        browser: { headless },
      });

      await claw.initialize();
      
      if (headless && username && password) {
        console.log(`\n🔐 Logging in to ${platform} (headless mode)...`);
        const success = await claw.loginWithCredentials(platform, username, password);
        
        if (success) {
          console.log(`✅ Successfully logged in to ${platform}`);
        } else {
          console.log(`❌ Login to ${platform} failed`);
        }
      } else if (headless) {
        console.log(`\n⚠️  Headless login requires credentials.`);
        console.log(`Set ${envPrefix}_USERNAME and ${envPrefix}_PASSWORD in .env`);
        console.log(`Or pass -u USERNAME -p PASSWORD\n`);
      } else {
        console.log(`\nOpening ${platform} login...`);
        console.log('Please enter your credentials in the browser window.\n');

        const success = await claw.login(platform);

        if (success) {
          console.log(`✅ Successfully logged in to ${platform}`);
        } else {
          console.log(`❌ Login to ${platform} failed or timed out`);
        }
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Login failed:', error);
      process.exit(1);
    }
  });

session
  .command('status')
  .description('Check login status for all platforms')
  .action(async () => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const status = await claw.getStatus();

      console.log('\n📊 Session Status\n');
      console.log(`Browser: ${status.browser ? '✅ Running' : '❌ Not running'}`);
      console.log(`Uptime: ${Math.floor(status.uptime)}s\n`);

      for (const [platform, info] of Object.entries(status.platforms)) {
        console.log(`${platform.charAt(0).toUpperCase() + platform.slice(1)}:`);
        console.log(`  Logged in: ${info.loggedIn ? '✅' : '❌'}`);
        console.log('  Rate limits:');
        for (const [action, limit] of Object.entries(info.rateLimits)) {
          console.log(`    ${action}: ${limit.remaining}/${limit.total} remaining`);
        }
        console.log();
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Failed to get status:', error);
      process.exit(1);
    }
  });

session
  .command('logout <platform>')
  .description('Logout from a platform')
  .action(async (platform: Platform) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();
      await claw.logout(platform);
      console.log(`✅ Logged out of ${platform}`);
      await claw.shutdown();
    } catch (error) {
      console.error('Logout failed:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Instagram commands
// ============================================================================

const ig = program.command('ig').alias('instagram').description('Instagram actions');

ig.command('like <url>')
  .description('Like an Instagram post')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.CLAWSOCIAL_SILENT = '1';
    
    const claw = new ClawSocial({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.instagram.like({ url });
          if (!res.success) throw new Error(res.error || 'Like failed');
          return res;
        },
        { retries, actionName: 'IG like', target: url }
      );

      console.log(`✅ Liked post: ${url}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'like', true, url,
          { postUrl: url, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to like after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'like', false, url, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

ig.command('follow <username>')
  .description('Follow an Instagram user')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (username: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.CLAWSOCIAL_SILENT = '1';
    
    const claw = new ClawSocial({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.instagram.follow({ username });
          if (!res.success) throw new Error(res.error || 'Follow failed');
          return res;
        },
        { retries, actionName: 'IG follow', target: `@${username}` }
      );

      console.log(`✅ Followed: @${username}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'follow', true, username,
          { profileUrl: `https://instagram.com/${username}`, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to follow @${username} after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'follow', false, username, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

ig.command('comment <url> <text>')
  .description('Comment on an Instagram post')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string, text: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.CLAWSOCIAL_SILENT = '1';
    
    const claw = new ClawSocial({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.instagram.comment({ url, text });
          if (!res.success) throw new Error(res.error || 'Comment failed');
          return res;
        },
        { retries, actionName: 'IG comment', target: url }
      );

      console.log(`✅ Commented on: ${url}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'comment', true, url,
          { postUrl: url, commentText: text, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to comment after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'comment', false, url, context, errorMsg
        );
      }

      await claw.shutdown();
      process.exit(1);
    }
  });

ig.command('dm <username> <message>')
  .description('Send a DM to an Instagram user')
  .action(async (username: string, message: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.instagram.dm({ username, message });

      if (result.success) {
        console.log(`✅ Sent DM to: @${username}`);
      } else {
        console.log(`❌ Failed to send DM: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('profile <username>')
  .description('Get Instagram profile data')
  .action(async (username: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const profile = await claw.instagram.getProfile(username);
      console.log(JSON.stringify(profile, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('followers <username>')
  .description('Scrape followers from an Instagram profile')
  .option('-n, --limit <number>', 'Max followers to scrape', '10')
  .action(async (username: string, options: { limit: string }) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const limit = parseInt(options.limit, 10);
      const followers = await claw.instagram.scrapeFollowers(username, limit);
      
      console.log(`\n📋 Scraped ${followers.length} followers from @${username}:\n`);
      followers.forEach((f, i) => console.log(`  ${i + 1}. @${f}`));
      console.log(JSON.stringify({ username, followers, count: followers.length }, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('posts <username>')
  .description('Get recent posts from an Instagram profile')
  .option('-n, --limit <number>', 'Max posts to get', '3')
  .action(async (username: string, options: { limit: string }) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const limit = parseInt(options.limit, 10);
      const posts = await claw.instagram.getRecentPosts(username, limit);
      
      console.log(`\n📷 Recent posts from @${username}:\n`);
      posts.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
      console.log(JSON.stringify({ username, posts, count: posts.length }, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Twitter commands
// ============================================================================

const twitter = program.command('twitter').alias('x').description('Twitter/X actions');

twitter
  .command('like <url>')
  .description('Like a tweet')
  .option('-c, --context <json>', 'JSON context for notification (language, behaviors, etc.)')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.CLAWSOCIAL_SILENT = '1';
    
    const claw = new ClawSocial({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.twitter.like({ url });
          if (!res.success) throw new Error(res.error || 'Like failed');
          return res;
        },
        { retries, actionName: 'X like', target: url }
      );

      console.log(`✅ Liked tweet: ${url}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'twitter', 'like', true, url,
          { postUrl: url, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to like after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'twitter', 'like', false, url, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

twitter
  .command('tweet <text>')
  .description('Post a tweet')
  .action(async (text: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.twitter.post({ text });

      if (result.success) {
        console.log(`✅ Posted tweet`);
      } else {
        console.log(`❌ Failed to post: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

twitter
  .command('follow <username>')
  .description('Follow a Twitter user')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (usernameOrUrl: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.CLAWSOCIAL_SILENT = '1';
    
    // Extract username from URL if needed
    let username = usernameOrUrl;
    if (usernameOrUrl.includes('x.com/') || usernameOrUrl.includes('twitter.com/')) {
      const match = usernameOrUrl.match(/(?:x\.com|twitter\.com)\/(@?[\w]+)/);
      if (match) {
        username = match[1].replace('@', '');
      }
    }
    username = username.replace(/^@/, '');
    
    const claw = new ClawSocial({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.twitter.follow({ username });
          if (!res.success) throw new Error(res.error || 'Follow failed');
          return res;
        },
        { retries, actionName: 'X follow', target: `@${username}` }
      );

      console.log(`✅ Followed: @${username}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'twitter', 'follow', true, username,
          { profileUrl: `https://x.com/${username}`, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to follow @${username} after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'twitter', 'follow', false, username, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

twitter
  .command('reply <url> <text>')
  .description('Reply to a tweet')
  .option('-c, --context <json>', 'JSON context for notification')
  .action(async (url: string, text: string, options: { context?: string }) => {
    try {
      const context = parseContext(options.context);
      if (context) process.env.CLAWSOCIAL_SILENT = '1';
      
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.twitter.comment({ url, text });

      if (result.success) {
        console.log(`✅ Replied to tweet`);
      } else {
        console.log(`❌ Failed to reply: ${result.error}`);
      }
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'twitter', 'comment', result.success, url,
          { postUrl: url, commentText: text, actions: ['💬 Replied'], ...context },
          result.error
        );
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// X DM removed - encrypted DMs require passcode that can't be automated

// ============================================================================
// LinkedIn commands
// ============================================================================

const linkedin = program.command('linkedin').alias('li').description('LinkedIn actions');

linkedin
  .command('connect <url>')
  .description('Send a connection request')
  .option('-n, --note <note>', 'Add a note to the connection request')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string, options: { note?: string; context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.CLAWSOCIAL_SILENT = '1';
    
    const claw = new ClawSocial({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.linkedin.connect({
            profileUrl: url,
            note: options.note,
          });
          if (!res.success) throw new Error(res.error || 'Connect failed');
          return res;
        },
        { retries, actionName: 'LinkedIn connect', target: url }
      );

      console.log(`✅ Sent connection request to: ${url}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'linkedin', 'connect', true, url,
          { profileUrl: url, note: options.note, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to connect after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'linkedin', 'connect', false, url, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

linkedin
  .command('message <url> <text>')
  .description('Send a LinkedIn message')
  .action(async (url: string, text: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.dm({ username: url, message: text });

      if (result.success) {
        console.log(`✅ Sent message`);
      } else {
        console.log(`❌ Failed to send message: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('like <url>')
  .description('Like a LinkedIn post')
  .action(async (url: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.like({ url });

      if (result.success) {
        console.log(`✅ Liked post: ${url}`);
      } else {
        console.log(`❌ Failed to like: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('profile <username>')
  .description('Get LinkedIn profile data')
  .action(async (username: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const profile = await claw.linkedin.getProfile(username);
      console.log(JSON.stringify(profile, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('comment <url> <text>')
  .description('Comment on a LinkedIn post')
  .action(async (url: string, text: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.comment({ url, text });

      if (result.success) {
        console.log(`✅ Commented on post: ${url}`);
      } else {
        console.log(`❌ Failed to comment: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('search <query>')
  .description('Search LinkedIn for content')
  .option('-o, --output <file>', 'Save HTML to file')
  .action(async (query: string, options: { output?: string }) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.search(query);

      console.log(`Found ${result.posts.length} posts:`);
      for (const post of result.posts) {
        console.log(`  - ${post.urn}`);
        console.log(`    ${post.url}`);
      }

      if (options.output) {
        const fs = await import('fs');
        fs.writeFileSync(options.output, result.html);
        console.log(`\nHTML saved to: ${options.output}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('engage')
  .description('Run full engagement session (search + like + comment)')
  .option('-q, --query <query>', 'Search query', 'openclaw')
  .option('--dry-run', 'Show what would be done without doing it')
  .option('--skip-search', 'Skip the search step, use existing articles')
  .action(async (options: { query: string; dryRun?: boolean; skipSearch?: boolean }) => {
    try {
      const args = ['src/scripts/engage.ts', `--query=${options.query}`];
      if (options.dryRun) args.push('--dry-run');
      if (options.skipSearch) args.push('--skip-search');
      
      const { spawn } = await import('child_process');
      const child = spawn('npx', ['tsx', ...args], {
        cwd: process.cwd(),
        stdio: 'inherit',
      });
      
      child.on('exit', (code) => process.exit(code || 0));
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Notification commands
// ============================================================================

const notify = program.command('notify').description('Manage notifications');

notify
  .command('status')
  .description('Show notification configuration status')
  .action(async () => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      console.log('\n📬 Notification Status\n');
      console.log(`Enabled: ${notifier.isEnabled() ? '✅ Yes' : '❌ No'}`);
      
      const channels = notifier.getChannels();
      console.log(`\nConfigured Channels:`);
      if (channels.length === 0) {
        console.log('  (none)');
      } else {
        channels.forEach(ch => console.log(`  • ${ch}`));
      }
      
      console.log(`\nEvent Notifications:`);
      console.log(`  • action:complete    ${notifier.isEventEnabled('action:complete') ? '✅' : '❌'}`);
      console.log(`  • action:error       ${notifier.isEventEnabled('action:error') ? '✅' : '❌'}`);
      console.log(`  • session:login      ${notifier.isEventEnabled('session:login') ? '✅' : '❌'}`);
      console.log(`  • ratelimit:exceeded ${notifier.isEventEnabled('ratelimit:exceeded') ? '✅' : '❌'}`);
      
      console.log(`\nEnvironment Variables:`);
      console.log(`  NOTIFY_ENABLED=${process.env.NOTIFY_ENABLED || '(not set)'}`);
      console.log(`  NOTIFY_TELEGRAM_BOT_TOKEN=${process.env.NOTIFY_TELEGRAM_BOT_TOKEN ? '***configured***' : '(not set)'}`);
      console.log(`  NOTIFY_TELEGRAM_CHAT_ID=${process.env.NOTIFY_TELEGRAM_CHAT_ID || '(not set)'}`);
      console.log(`  NOTIFY_DISCORD_WEBHOOK=${process.env.NOTIFY_DISCORD_WEBHOOK ? '***configured***' : '(not set)'}`);
      console.log(`  NOTIFY_WEBHOOK_URL=${process.env.NOTIFY_WEBHOOK_URL || '(not set)'}`);
      console.log();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

notify
  .command('test [channel]')
  .description('Send a test notification (telegram, discord, webhook, or all)')
  .action(async (channel?: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      if (!notifier.isEnabled()) {
        console.log('❌ Notifications are disabled. Set NOTIFY_ENABLED=true in .env');
        process.exit(1);
      }
      
      console.log(`\n🧪 Sending test notification${channel ? ` to ${channel}` : ' to all channels'}...\n`);
      
      const success = await notifier.sendTest(channel as any);
      
      if (success) {
        console.log('✅ Test notification sent successfully');
      } else {
        console.log('❌ Failed to send test notification');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

notify
  .command('send <message>')
  .description('Send a custom notification message')
  .option('-c, --channel <channel>', 'Send to specific channel (telegram, discord, webhook)')
  .action(async (message: string, options: { channel?: string }) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      if (!notifier.isEnabled()) {
        console.log('❌ Notifications are disabled. Set NOTIFY_ENABLED=true in .env');
        process.exit(1);
      }
      
      let success: boolean;
      if (options.channel) {
        success = await notifier.send(options.channel as any, message);
      } else {
        success = await notifier.broadcast(message);
      }
      
      if (success) {
        console.log('✅ Notification sent');
      } else {
        console.log('❌ Failed to send notification');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Formatted notification command (for cron jobs)
// ============================================================================

notify
  .command('report <platform> <action> <target>')
  .description('Send a formatted notification report (for cron jobs)')
  .option('--context <json>', 'JSON context with all fields')
  .option('--success', 'Mark as success (default)', true)
  .option('--error <message>', 'Mark as error with message')
  .action(async (platform: string, action: string, target: string, options: { context?: string; success?: boolean; error?: string }) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      if (!notifier.isEnabled()) {
        console.log('❌ Notifications disabled. Set NOTIFY_ENABLED=true');
        process.exit(1);
      }
      
      let details: Record<string, unknown> = {};
      if (options.context) {
        try {
          details = JSON.parse(options.context);
        } catch {
          console.error('❌ Invalid JSON in --context');
          process.exit(1);
        }
      }
      
      const success = !options.error;
      
      await notifier.notify({
        event: success ? 'action:complete' : 'action:error',
        platform: platform as any,
        action: action as any,
        success,
        target,
        error: options.error,
        details,
        timestamp: Date.now(),
      });
      
      console.log(`✅ ${platform.toUpperCase()} ${action.toUpperCase()} report sent`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Test notification commands (for testing templates)
// ============================================================================

notify
  .command('test-x-like')
  .description('Send a test X LIKE notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled. Set NOTIFY_ENABLED=true');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'twitter',
      action: 'like',
      success: true,
      target: 'https://x.com/elonmusk/status/123456789',
      details: {
        tweet: 'https://x.com/elonmusk/status/123456789',
        author: 'elonmusk',
        preview: 'Just mass-produced the most insane humanoid robot ever. Coming to a store near you soon...',
        language: 'EN',
        behaviors: 'Warm-up ✅, Profile check ✅',
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test X LIKE notification sent');
  });

notify
  .command('test-x-follow')
  .description('Send a test X FOLLOW notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'twitter',
      action: 'follow',
      success: true,
      target: 'vutruso',
      details: {
        profileUrl: 'https://x.com/vutruso',
        followers: 5200,
        queueRemaining: 12,
        actions: ['👥 Followed'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test X FOLLOW notification sent');
  });

notify
  .command('test-x-reply')
  .description('Send a test X ENGAGEMENT (Like + Reply) notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'twitter',
      action: 'comment',
      success: true,
      target: 'https://x.com/openai/status/987654321',
      details: {
        tweet: 'https://x.com/openai/status/987654321',
        author: 'openai',
        preview: 'Introducing GPT-5: The most capable AI model yet. Now available for everyone...',
        reply: 'Incredible progress! What features are you most excited about? 🚀',
        language: 'EN',
        behaviors: 'Warm-up ✅, Profile check ✅',
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test X ENGAGEMENT notification sent');
  });

notify
  .command('test-linkedin-connect')
  .description('Send a test LINKEDIN CONNECTION notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'linkedin',
      action: 'connect',
      success: true,
      target: 'https://linkedin.com/in/john-developer',
      details: {
        profileUrl: 'https://linkedin.com/in/john-developer',
        degree: '2nd',
        method: 'Direct',
        actions: ['🔗 Connection Sent'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test LINKEDIN CONNECTION notification sent');
  });

notify
  .command('test-linkedin-comment')
  .description('Send a test LINKEDIN ENGAGEMENT notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'linkedin',
      action: 'comment',
      success: true,
      target: 'https://linkedin.com/feed/update/urn:li:activity:123456',
      details: {
        url: 'https://linkedin.com/feed/update/urn:li:activity:123456',
        articleTitle: 'The Future of AI Automation in Enterprise',
        articleAuthor: 'Sarah Chen, CTO at TechVentures',
        comment: 'Great insights! AI is definitely changing how we approach complex problems. The key is finding the right balance between automation and human oversight.',
        sessionInfo: 'Morning batch (2/4)',
        actions: ['❤️ Liked', '💬 Commented'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test LINKEDIN COMMENT notification sent');
  });

notify
  .command('test-ig-follow')
  .description('Send a test INSTAGRAM FOLLOW notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'instagram',
      action: 'follow',
      success: true,
      target: 'techfounder',
      details: {
        profileUrl: 'https://instagram.com/techfounder',
        followers: 12500,
        actions: ['👥 Followed'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test INSTAGRAM FOLLOW notification sent');
  });

notify
  .command('test-ig-comment')
  .description('Send a test INSTAGRAM COMMENT notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'instagram',
      action: 'comment',
      success: true,
      target: 'https://instagram.com/p/ABC123xyz',
      details: {
        postUrl: 'https://instagram.com/p/ABC123xyz',
        commentText: 'This is fire! 🔥 Keep building!',
        actions: ['❤️ Liked', '💬 Commented'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test INSTAGRAM COMMENT notification sent');
  });

notify
  .command('test-error')
  .description('Send a test ERROR notification')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:error',
      platform: 'twitter',
      action: 'like',
      success: false,
      target: 'https://x.com/private_account/status/999',
      error: 'Rate limit exceeded - try again in 15 minutes',
      details: {
        postUrl: 'https://x.com/private_account/status/999',
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test ERROR notification sent');
  });

notify
  .command('test-all')
  .description('Send all test notifications')
  .action(async () => {
    const claw = new ClawSocial({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled. Set NOTIFY_ENABLED=true');
      process.exit(1);
    }
    
    console.log('🧪 Sending all test notifications...\n');
    
    const tests = [
      { name: 'X LIKE', platform: 'twitter' as Platform, action: 'like' as ActionType, details: { postUrl: 'https://x.com/test/status/123', author: 'testuser', actions: ['❤️ Liked'], language: 'EN', behaviors: 'Warm-up ✅' } },
      { name: 'X FOLLOW', platform: 'twitter' as Platform, action: 'follow' as ActionType, details: { profileUrl: 'https://x.com/testuser', followers: 5200, queueRemaining: 8, actions: ['👥 Followed'] } },
      { name: 'X REPLY', platform: 'twitter' as Platform, action: 'comment' as ActionType, details: { postUrl: 'https://x.com/test/status/456', commentText: 'Great insights!', actions: ['❤️ Liked', '💬 Replied'], language: 'EN' } },
      { name: 'LINKEDIN CONNECTION', platform: 'linkedin' as Platform, action: 'connect' as ActionType, details: { profileUrl: 'https://linkedin.com/in/test', degree: '2nd', method: 'Direct', actions: ['🔗 Connection Sent'] } },
      { name: 'LINKEDIN COMMENT', platform: 'linkedin' as Platform, action: 'comment' as ActionType, details: { postUrl: 'https://linkedin.com/feed/update/123', articleTitle: 'AI Future', commentText: 'Great article!', actions: ['❤️ Liked', '💬 Commented'] } },
      { name: 'INSTAGRAM FOLLOW', platform: 'instagram' as Platform, action: 'follow' as ActionType, details: { profileUrl: 'https://instagram.com/testuser', followers: 12500, actions: ['👥 Followed'] } },
      { name: 'INSTAGRAM COMMENT', platform: 'instagram' as Platform, action: 'comment' as ActionType, details: { postUrl: 'https://instagram.com/p/ABC123', commentText: 'This is fire! 🔥', actions: ['❤️ Liked', '💬 Commented'] } },
    ];
    
    for (const test of tests) {
      await notifier.notify({
        event: 'action:complete',
        platform: test.platform,
        action: test.action,
        success: true,
        target: test.details.postUrl || test.details.profileUrl || 'test',
        details: test.details,
        timestamp: Date.now(),
      });
      console.log(`  ✅ ${test.name}`);
      await new Promise(r => setTimeout(r, 500)); // Small delay between messages
    }
    
    console.log('\n✅ All test notifications sent!');
  });

// Parse arguments
program.parse();
