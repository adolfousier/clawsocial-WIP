import { BasePlatformHandler } from './base.js';
import { log } from '../utils/logger.js';
import type { BrowserManager } from '../browser/manager.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type {
  ActionResult,
  LikePayload,
  CommentPayload,
  FollowPayload,
  DMPayload,
  InstagramProfile,
} from '../types/index.js';

// Instagram selectors (updated for current Instagram UI)
const SELECTORS = {
  // Cookie consent
  cookieAccept: 'button:has-text("Allow all cookies"), button:has-text("Accept All"), button:has-text("Allow essential and optional cookies"), button._a9--._ap36._a9_0',
  cookieDecline: 'button:has-text("Decline optional cookies"), button:has-text("Only allow essential cookies")',
  
  // Login
  loginUsername: 'input[name="username"], input[aria-label*="username"], input[aria-label*="Phone"], input[autocomplete="username"]',
  loginPassword: 'input[name="password"], input[type="password"], input[aria-label*="Password"]',
  loginButton: 'button[type="submit"], button:has-text("Log in"), div[role="button"]:has-text("Log in")',
  loginError: '#slfErrorAlert, p[data-testid="login-error-message"]',
  notNowButton: 'button:has-text("Not Now"), div[role="button"]:has-text("Not now")',
  saveLoginButton: 'button:has-text("Save Info"), button:has-text("Save info")',
  
  // Profile indicators
  profileIcon: 'svg[aria-label="Home"]',
  loggedInNav: 'nav[role="navigation"]',
  
  // Post interactions
  likeButton: 'svg[aria-label="Like"], span svg[aria-label="Like"]',
  unlikeButton: 'svg[aria-label="Unlike"]',
  commentInput: 'textarea[placeholder*="Add a comment"], textarea[aria-label*="Add a comment"]',
  postButton: 'div[role="button"]:has-text("Post"), button:has-text("Post")',
  
  // Profile page
  followButton: 'button:has-text("Follow"):not(:has-text("Following"))',
  unfollowButton: 'button:has-text("Following")',
  unfollowConfirm: 'button:has-text("Unfollow")',
  messageButton: 'div[role="button"]:has-text("Message")',
  
  // DM
  dmInput: 'textarea[placeholder*="Message"], div[contenteditable="true"][aria-label*="Message"]',
  dmSendButton: 'button[type="submit"] svg, div[role="button"]:has-text("Send")',
  newMessageButton: 'svg[aria-label="New message"]',
  searchUserInput: 'input[placeholder*="Search"]',
  userResult: 'div[role="button"] span',
  nextButton: 'div[role="button"]:has-text("Next")',
  
  // Profile data
  profileUsername: 'header h2',
  profileFullName: 'header section > div:last-child span',
  profileBio: 'header section > div span',
  followerCount: 'a[href*="/followers/"] span, li:has-text("followers") span',
  followingCount: 'a[href*="/following/"] span, li:has-text("following") span',
  postCount: 'li:has-text("posts") span',
  verifiedBadge: 'svg[aria-label="Verified"]',
  
  // Followers popup
  followersLink: 'a[href*="/followers/"]',
  followersDialog: 'div[role="dialog"]',
  followersDialogList: 'div[role="dialog"] div[style*="overflow"]',
  followerItem: 'div[role="dialog"] a[role="link"][href^="/"]',
  followerUsername: 'span a[href^="/"], a[role="link"] span',
  
  // Posts grid
  postsGrid: 'article a[href*="/p/"], main article a[href*="/p/"]',
  postLink: 'a[href*="/p/"]',
};

export class InstagramHandler extends BasePlatformHandler {
  private readonly baseUrl = 'https://www.instagram.com';

  constructor(browserManager: BrowserManager, rateLimiter: RateLimiter) {
    super('instagram', browserManager, rateLimiter);
  }

  /**
   * Check if logged in to Instagram
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.navigate(`${this.baseUrl}/`);
      await this.delay();
      
      // Check for logged-in indicators
      const hasNav = await this.elementExists(SELECTORS.loggedInNav);
      const hasProfileIcon = await this.elementExists(SELECTORS.profileIcon);
      
      return hasNav && hasProfileIcon;
    } catch (error) {
      log.error('Error checking Instagram login status', { error: String(error) });
      return false;
    }
  }

  /**
   * Login to Instagram (interactive - requires manual input)
   */
  async login(): Promise<boolean> {
    try {
      log.info('Starting Instagram login...');
      
      await this.navigate(`${this.baseUrl}/accounts/login/`);
      await this.delay();

      // Check if already logged in
      if (await this.isLoggedIn()) {
        log.info('Already logged in to Instagram');
        return true;
      }

      // Wait for login form
      const hasLoginForm = await this.waitForElement(SELECTORS.loginUsername, 15000);
      if (!hasLoginForm) {
        log.error('Login form not found');
        return false;
      }

      log.info('Instagram login form ready. Please enter credentials manually in the browser.');
      log.info('Waiting for login to complete...');

      // Wait for successful login (up to 2 minutes for manual input)
      const startTime = Date.now();
      const timeout = 120000;

      while (Date.now() - startTime < timeout) {
        if (await this.isLoggedIn()) {
          log.info('Instagram login successful');
          await this.browserManager.saveSession('instagram');
          
          // Handle "Save Login Info" popup
          if (await this.elementExists(SELECTORS.saveLoginButton)) {
            await this.clickHuman(SELECTORS.saveLoginButton);
            await this.delay();
          }
          
          // Handle "Turn on Notifications" popup
          if (await this.elementExists(SELECTORS.notNowButton)) {
            await this.clickHuman(SELECTORS.notNowButton);
            await this.delay();
          }
          
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      log.error('Instagram login timeout');
      return false;
    } catch (error) {
      log.error('Instagram login failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Handle cookie consent popup
   */
  private async handleCookieConsent(): Promise<void> {
    try {
      // Try to find and click cookie accept button
      const page = await this.getPage();
      
      // Wait a bit for popup to appear
      await this.pause();
      
      // Try different selectors for cookie consent
      const cookieSelectors = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Accept All")',
        'button:has-text("Allow essential and optional cookies")',
        'button:has-text("Accept")',
        '[role="dialog"] button:first-of-type',
        'button._a9--._ap36._a9_0',
      ];
      
      for (const selector of cookieSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            await button.click();
            log.info('Cookie consent accepted');
            await this.pause();
            return;
          }
        } catch {
          // Try next selector
        }
      }
      
      log.debug('No cookie consent popup found');
    } catch (error) {
      log.debug('Cookie consent handling skipped', { error: String(error) });
    }
  }

  /**
   * Login with credentials (headless)
   */
  async loginWithCredentials(username: string, password: string): Promise<boolean> {
    try {
      log.info('Starting Instagram headless login...');
      
      await this.navigate(`${this.baseUrl}/accounts/login/`);
      await this.delay();

      // Handle cookie consent popup first
      await this.handleCookieConsent();
      
      // Wait for page to stabilize
      await this.delay();

      // Take debug screenshot
      const page = await this.getPage();
      await page.screenshot({ path: './sessions/debug-login.png' });
      log.info('Debug screenshot saved to ./sessions/debug-login.png');

      // Check if already logged in
      if (await this.isLoggedIn()) {
        log.info('Already logged in to Instagram');
        return true;
      }

      // Check if we're on the "Continue as [username]" screen (has profile pic, no username field)
      const hasUsernameField = await this.elementExists('input[name="username"], input[type="text"]');
      const hasContinueButton = await this.elementExists('button:has-text("Continue"), div[role="button"]:has-text("Continue")');
      
      if (hasContinueButton && !hasUsernameField) {
        // This is the "Continue as saved account" screen
        // Click "Use another profile" to get to standard login form (more reliable than Continue button)
        log.info('Found "Continue as saved account" screen - clicking "Use another profile"');
        
        try {
          const useAnotherBtn = page.locator('button:has-text("Use another profile"), div[role="button"]:has-text("Use another profile")').first();
          await useAnotherBtn.click({ force: true });
          log.info('Clicked "Use another profile" button');
          await this.delay();
        } catch (error) {
          log.warn('Failed to click "Use another profile"', { error: String(error) });
        }
      }

      // Standard username/password login flow
      // Try multiple selectors for the username field
      const usernameSelectors = [
        'input[name="username"]',
        'input[aria-label*="username"]', 
        'input[aria-label*="Phone"]',
        'input[aria-label*="email"]',
        'input[autocomplete="username"]',
        'input[type="text"]',
      ];
      
      let usernameField = null;
      for (const sel of usernameSelectors) {
        if (await this.waitForElement(sel, 3000)) {
          usernameField = sel;
          log.info(`Found username field with selector: ${sel}`);
          break;
        }
      }
      
      if (!usernameField) {
        log.error('Login form not found - check ./sessions/debug-login.png');
        await page.screenshot({ path: './sessions/debug-login-fail.png' });
        return false;
      }

      // Enter username
      log.info('Typing username...');
      await page.locator(usernameField).first().fill(username);
      await this.pause();
      log.info('Username entered');

      // Find and enter password
      const passwordSelectors = ['input[name="password"]', 'input[type="password"]', 'input[aria-label*="Password"]'];
      let passwordField = null;
      for (const sel of passwordSelectors) {
        if (await this.elementExists(sel)) {
          passwordField = sel;
          log.info(`Found password field with selector: ${sel}`);
          break;
        }
      }
      
      if (!passwordField) {
        log.error('Password field not found');
        await page.screenshot({ path: './sessions/debug-password-fail.png' });
        return false;
      }
      
      log.info('Typing password...');
      await page.locator(passwordField).first().fill(password);
      await this.pause();
      log.info('Password entered');
      
      // Take screenshot before clicking login
      await page.screenshot({ path: './sessions/debug-before-login.png' });
      log.info('Screenshot saved before clicking login');

      // Click login button
      const loginSelectors = ['button[type="submit"]', 'button:has-text("Log in")', 'div[role="button"]:has-text("Log in")'];
      for (const sel of loginSelectors) {
        if (await this.elementExists(sel)) {
          log.info(`Clicking login button: ${sel}`);
          await this.clickHuman(sel);
          break;
        }
      }
      await this.delay();
      
      // Take screenshot after clicking login
      await page.screenshot({ path: './sessions/debug-after-login.png' });
      log.info('Screenshot saved after clicking login');

      // Wait for page to change (login processing)
      await page.waitForTimeout(5000);
      
      // Capture current URL and page state for debugging
      const currentUrl = page.url();
      log.info('Current URL after login attempt', { url: currentUrl });
      await page.screenshot({ path: './sessions/debug-post-login.png' });
      log.info('Post-login screenshot saved');

      // Check for security checkpoint or verification
      const checkpointSelectors = [
        'input[name="verificationCode"]',
        'input[placeholder*="code"]',
        'input[aria-label*="code"]',
        'button:has-text("Send Security Code")',
        'div:has-text("Enter the 6-digit code")',
        'div:has-text("Suspicious Login Attempt")',
        'div:has-text("verify")',
      ];
      
      for (const sel of checkpointSelectors) {
        if (await this.elementExists(sel)) {
          log.warn('Security checkpoint detected - manual verification required', { selector: sel });
          await page.screenshot({ path: './sessions/debug-checkpoint.png' });
          log.info('Checkpoint screenshot saved to ./sessions/debug-checkpoint.png');
          log.info('Please complete verification manually in browser, then retry with saved session');
          return false;
        }
      }

      // Wait for login to complete (check for home page or error)
      const startTime = Date.now();
      const timeout = 30000;

      while (Date.now() - startTime < timeout) {
        // Check for login error
        if (await this.elementExists(SELECTORS.loginError)) {
          log.error('Instagram login failed - invalid credentials');
          await page.screenshot({ path: './sessions/debug-login-error.png' });
          return false;
        }

        // Check for session cookie as primary indicator
        const cookies = await page.context().cookies();
        const hasSession = cookies.some(c => c.name === 'sessionid');
        if (hasSession) {
          log.info('Session cookie detected - login successful');
          await this.browserManager.saveSession('instagram');
          
          // Handle popups
          if (await this.elementExists(SELECTORS.saveLoginButton)) {
            await this.clickHuman(SELECTORS.saveLoginButton);
            await this.delay();
          }
          
          if (await this.elementExists(SELECTORS.notNowButton)) {
            await this.clickHuman(SELECTORS.notNowButton);
            await this.delay();
          }
          
          return true;
        }

        // Also check DOM for logged-in state
        if (await this.isLoggedIn()) {
          log.info('Instagram login successful (DOM check)');
          await this.browserManager.saveSession('instagram');
          return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        // Periodic debug screenshot
        if (Date.now() - startTime > 15000) {
          await page.screenshot({ path: './sessions/debug-waiting.png' });
          log.info('Still waiting for login...', { elapsed: Math.round((Date.now() - startTime) / 1000) });
        }
      }

      // Final debug info
      await page.screenshot({ path: './sessions/debug-timeout.png' });
      log.error('Instagram login timeout - check ./sessions/debug-timeout.png');
      log.info('Final URL', { url: page.url() });
      return false;
    } catch (error) {
      log.error('Instagram login failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Logout from Instagram
   */
  async logout(): Promise<void> {
    try {
      await this.browserManager.closeContext('instagram');
      log.info('Logged out of Instagram');
    } catch (error) {
      log.error('Error logging out of Instagram', { error: String(error) });
    }
  }

  /**
   * Like an Instagram post
   */
  async like(payload: LikePayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('like');

    if (!allowed) {
      return this.createErrorResult('like', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Liking Instagram post', { url: payload.url });

      // Navigate to home first for warm-up browsing
      await this.navigate(`${this.baseUrl}/`);
      await this.warmUp({ scrollCount: 2 + Math.floor(Math.random() * 2) });

      // Now navigate to post
      await this.navigate(payload.url);
      await this.think();

      // Check if already liked
      if (await this.elementExists(SELECTORS.unlikeButton)) {
        log.info('Post already liked');
        return this.createResult('like', payload.url, startTime, status, {
          postUrl: payload.url,
          actions: ['❤️ Already Liked'],
        });
      }

      // Find and click like button
      if (!(await this.elementExists(SELECTORS.likeButton))) {
        return this.createErrorResult('like', payload.url, 'Like button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.likeButton);
      await this.pause();

      // Verify like was successful
      if (await this.elementExists(SELECTORS.unlikeButton)) {
        await this.recordAction('like');
        log.info('Successfully liked Instagram post');
        return this.createResult('like', payload.url, startTime, status, {
          postUrl: payload.url,
          actions: ['❤️ Liked'],
        });
      }

      return this.createErrorResult('like', payload.url, 'Like action failed', startTime, status);
    } catch (error) {
      log.error('Error liking Instagram post', { error: String(error) });
      return this.createErrorResult('like', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Comment on an Instagram post
   */
  async comment(payload: CommentPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('comment');

    if (!allowed) {
      return this.createErrorResult('comment', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Commenting on Instagram post', { url: payload.url });

      // Navigate to home first for warm-up browsing
      await this.navigate(`${this.baseUrl}/`);
      await this.warmUp({ scrollCount: 2 + Math.floor(Math.random() * 2) });

      // Now navigate to post
      await this.navigate(payload.url);
      await this.think();

      // Find comment input
      if (!(await this.waitForElement(SELECTORS.commentInput, 10000))) {
        return this.createErrorResult('comment', payload.url, 'Comment input not found', startTime, status);
      }

      // Click on comment input to focus
      await this.clickHuman(SELECTORS.commentInput);
      await this.pause();

      // Type comment
      await this.typeHuman(SELECTORS.commentInput, payload.text);
      await this.pause();

      // Submit comment
      const page = await this.getPage();
      const postButton = page.locator(SELECTORS.postButton).first();
      
      if (await postButton.isVisible()) {
        await postButton.click();
      } else {
        // Try pressing Enter as fallback
        await page.keyboard.press('Enter');
      }

      await this.delay();
      await this.recordAction('comment');
      
      log.info('Successfully commented on Instagram post');
      return this.createResult('comment', payload.url, startTime, status, {
        postUrl: payload.url,
        commentText: payload.text,
        actions: ['💬 Commented'],
      });
    } catch (error) {
      log.error('Error commenting on Instagram post', { error: String(error) });
      return this.createErrorResult('comment', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Follow an Instagram user
   */
  async follow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('follow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Following Instagram user', { username: payload.username });

      // Navigate to user profile
      const profileUrl = `${this.baseUrl}/${payload.username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Check if already following
      if (await this.elementExists(SELECTORS.unfollowButton)) {
        log.info('Already following user');
        return this.createResult('follow', payload.username, startTime, status, {
          profileUrl: `https://instagram.com/${payload.username}`,
          actions: ['👥 Already Following'],
        });
      }

      // Find and click follow button
      if (!(await this.elementExists(SELECTORS.followButton))) {
        return this.createErrorResult('follow', payload.username, 'Follow button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.followButton);
      await this.delay();

      // Verify follow was successful
      if (await this.elementExists(SELECTORS.unfollowButton)) {
        await this.recordAction('follow');
        log.info('Successfully followed Instagram user');
        return this.createResult('follow', payload.username, startTime, status, {
          profileUrl: `https://instagram.com/${payload.username}`,
          actions: ['👥 Followed'],
        });
      }

      return this.createErrorResult('follow', payload.username, 'Follow action failed', startTime, status);
    } catch (error) {
      log.error('Error following Instagram user', { error: String(error) });
      return this.createErrorResult('follow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Unfollow an Instagram user
   */
  async unfollow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('unfollow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Unfollowing Instagram user', { username: payload.username });

      // Navigate to user profile
      const profileUrl = `${this.baseUrl}/${payload.username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Check if not following
      if (!(await this.elementExists(SELECTORS.unfollowButton))) {
        log.info('Not following user');
        return this.createResult('unfollow', payload.username, startTime, status, {
          profileUrl: `https://instagram.com/${payload.username}`,
          actions: ['👋 Not Following'],
        });
      }

      // Click following button
      await this.clickHuman(SELECTORS.unfollowButton);
      await this.pause();

      // Confirm unfollow
      if (await this.waitForElement(SELECTORS.unfollowConfirm, 5000)) {
        await this.clickHuman(SELECTORS.unfollowConfirm);
        await this.delay();
      }

      // Verify unfollow was successful
      if (await this.elementExists(SELECTORS.followButton)) {
        await this.recordAction('follow');
        log.info('Successfully unfollowed Instagram user');
        return this.createResult('unfollow', payload.username, startTime, status, {
          profileUrl: `https://instagram.com/${payload.username}`,
          actions: ['👋 Unfollowed'],
        });
      }

      return this.createErrorResult('unfollow', payload.username, 'Unfollow action failed', startTime, status);
    } catch (error) {
      log.error('Error unfollowing Instagram user', { error: String(error) });
      return this.createErrorResult('unfollow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Send a direct message on Instagram
   */
  async dm(payload: DMPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('dm');

    if (!allowed) {
      return this.createErrorResult('dm', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Sending Instagram DM', { username: payload.username });

      // Navigate to home first for warm-up browsing
      await this.navigate(`${this.baseUrl}/`);
      await this.warmUp({ scrollCount: 3 + Math.floor(Math.random() * 2) });

      // Navigate to user profile
      const profileUrl = `${this.baseUrl}/${payload.username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Click message button
      if (!(await this.waitForElement(SELECTORS.messageButton, 10000))) {
        return this.createErrorResult('dm', payload.username, 'Message button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.messageButton);
      await this.delay();

      // Wait for DM input
      if (!(await this.waitForElement(SELECTORS.dmInput, 10000))) {
        return this.createErrorResult('dm', payload.username, 'DM input not found', startTime, status);
      }

      // Type message
      await this.clickHuman(SELECTORS.dmInput);
      await this.typeHuman(SELECTORS.dmInput, payload.message);
      await this.pause();

      // Send message
      const page = await this.getPage();
      await page.keyboard.press('Enter');
      
      await this.delay();
      await this.recordAction('dm');
      
      log.info('Successfully sent Instagram DM');
      return this.createResult('dm', payload.username, startTime, status, {
        profileUrl: `https://instagram.com/${payload.username}`,
        messagePreview: payload.message,
        actions: ['✉️ DM Sent'],
      });
    } catch (error) {
      log.error('Error sending Instagram DM', { error: String(error) });
      return this.createErrorResult('dm', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Get Instagram profile data
   */
  async getProfile(username: string): Promise<InstagramProfile> {
    try {
      log.info('Getting Instagram profile', { username });

      const profileUrl = `${this.baseUrl}/${username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Extract profile data
      const profile: InstagramProfile = {
        username,
      };

      // Get full name
      const fullName = await this.getText('header section > div:first-child span');
      if (fullName) profile.fullName = fullName;

      // Get bio
      const bio = await this.getText('header section > div:last-child span');
      if (bio && bio !== fullName) profile.bio = bio;

      // Get follower count
      const followerText = await this.getText(SELECTORS.followerCount);
      if (followerText) {
        profile.followers = this.parseCount(followerText);
      }

      // Get following count
      const followingText = await this.getText(SELECTORS.followingCount);
      if (followingText) {
        profile.following = this.parseCount(followingText);
      }

      // Get post count
      const postText = await this.getText(SELECTORS.postCount);
      if (postText) {
        profile.posts = this.parseCount(postText);
      }

      // Check if verified
      profile.isVerified = await this.elementExists(SELECTORS.verifiedBadge);

      // Check if private
      profile.isPrivate = await this.elementExists('h2:has-text("This Account is Private")');

      log.info('Got Instagram profile', { profile });
      return profile;
    } catch (error) {
      log.error('Error getting Instagram profile', { error: String(error) });
      return { username };
    }
  }

  /**
   * Scrape followers from a profile's followers popup
   * @param username - The profile to scrape followers from
   * @param limit - Max number of followers to scrape (default 10)
   */
  async scrapeFollowers(username: string, limit: number = 10): Promise<string[]> {
    const followers: string[] = [];
    
    try {
      log.info('Scraping Instagram followers', { username, limit });
      
      // Navigate to profile
      const profileUrl = `${this.baseUrl}/${username}/`;
      await this.navigate(profileUrl);
      await this.think();
      
      // Click on followers link to open popup
      const followersLinkSelector = SELECTORS.followersLink;
      if (!(await this.waitForElement(followersLinkSelector, 10000))) {
        log.error('Followers link not found');
        return followers;
      }
      
      await this.clickHuman(followersLinkSelector);
      await this.delay();
      
      // Wait for dialog to open
      if (!(await this.waitForElement(SELECTORS.followersDialog, 10000))) {
        log.error('Followers dialog not found');
        return followers;
      }
      
      const page = await this.getPage();
      
      // Scroll and collect followers
      let scrollAttempts = 0;
      const maxScrolls = Math.ceil(limit / 5) + 3; // Estimate ~5 users per scroll view
      
      while (followers.length < limit && scrollAttempts < maxScrolls) {
        // Extract usernames from current view
        const userLinks = await page.$$('div[role="dialog"] a[role="link"][href^="/"]');
        
        for (const link of userLinks) {
          if (followers.length >= limit) break;
          
          try {
            const href = await link.getAttribute('href');
            if (href && href.startsWith('/') && !href.includes('/p/') && !href.includes('/explore/')) {
              const extractedUsername = href.replace(/\//g, '').split('?')[0];
              if (extractedUsername && extractedUsername !== username && !followers.includes(extractedUsername)) {
                followers.push(extractedUsername);
                log.debug('Found follower', { username: extractedUsername });
              }
            }
          } catch {
            // Skip problematic elements
          }
        }
        
        // Scroll down in the dialog
        const dialog = await page.$('div[role="dialog"] div[style*="overflow"]');
        if (dialog) {
          await dialog.evaluate((el) => {
            el.scrollTop += 300;
          });
          await this.pause(); // Wait for content to load
        } else {
          // Try scrolling the dialog itself
          const dialogEl = await page.$('div[role="dialog"]');
          if (dialogEl) {
            await dialogEl.evaluate((el) => {
              const scrollable = el.querySelector('div[style*="overflow"]') || el;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (scrollable as any).scrollTop += 300;
            });
            await this.pause();
          }
        }
        
        scrollAttempts++;
        await this.delay();
      }
      
      // Close the dialog by pressing Escape
      await page.keyboard.press('Escape');
      await this.delay();
      
      log.info('Scraped Instagram followers', { count: followers.length, followers });
      return followers;
    } catch (error) {
      log.error('Error scraping Instagram followers', { error: String(error) });
      return followers;
    }
  }

  /**
   * Get recent posts from a user's profile
   * @param username - The profile to get posts from
   * @param limit - Max number of posts to get (default 3)
   */
  async getRecentPosts(username: string, limit: number = 3): Promise<string[]> {
    const posts: string[] = [];
    
    try {
      log.info('Getting recent posts', { username, limit });
      
      // Navigate to profile
      const profileUrl = `${this.baseUrl}/${username}/`;
      await this.navigate(profileUrl);
      await this.think();
      
      const page = await this.getPage();
      
      // Wait for posts to load - try multiple selectors
      const postSelectors = [
        'a[href*="/p/"]',
        'article a[href*="/p/"]',
        'main article a',
        'div[style*="flex"] a[href*="/p/"]',
      ];
      
      // Wait up to 10 seconds for any post to appear
      for (const selector of postSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          log.debug('Found posts with selector', { selector });
          break;
        } catch {
          // Try next selector
        }
      }
      
      // Additional wait for content to fully render
      await this.delay();
      
      // Find post links with multiple selector strategies (posts and reels)
      let postLinks = await page.$$('a[href*="/p/"], a[href*="/reel/"]');
      
      if (postLinks.length === 0) {
        // Try finding posts in article elements
        postLinks = await page.$$('article a[href*="/p/"], article a[href*="/reel/"]');
      }
      
      if (postLinks.length === 0) {
        // Try finding any links that might be posts
        const allLinks = await page.$$('a[href^="/"]');
        for (const link of allLinks) {
          const href = await link.getAttribute('href');
          if (href && (href.includes('/p/') || href.includes('/reel/'))) {
            postLinks.push(link);
          }
        }
      }
      
      log.debug('Found post links', { count: postLinks.length });
      
      for (const link of postLinks) {
        if (posts.length >= limit) break;
        
        try {
          const href = await link.getAttribute('href');
          if (href && (href.includes('/p/') || href.includes('/reel/'))) {
            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
            if (!posts.includes(fullUrl)) {
              posts.push(fullUrl);
            }
          }
        } catch {
          // Skip problematic elements
        }
      }
      
      log.info('Got recent posts', { count: posts.length, posts });
      return posts;
    } catch (error) {
      log.error('Error getting recent posts', { error: String(error) });
      return posts;
    }
  }

  /**
   * Parse count strings like "1.5M", "10K", "1,234"
   */
  private parseCount(text: string): number {
    const cleaned = text.replace(/,/g, '').trim();
    const match = cleaned.match(/^([\d.]+)([KMB])?$/i);
    
    if (!match) return 0;
    
    let num = parseFloat(match[1]);
    const suffix = match[2]?.toUpperCase();
    
    if (suffix === 'K') num *= 1000;
    else if (suffix === 'M') num *= 1000000;
    else if (suffix === 'B') num *= 1000000000;
    
    return Math.round(num);
  }
}
