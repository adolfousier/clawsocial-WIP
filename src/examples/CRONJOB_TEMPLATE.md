# ClawSocial Cron Job Template

**MANDATORY** — All cron jobs MUST use `notify report` command for notifications.

---

## New Notification System

Use the `notify report` command to send formatted notifications:

```bash
npm run cli -- notify report <platform> <action> <target> --context='<JSON>'
```

**Platforms:** `twitter`, `linkedin`, `instagram`
**Actions:** `like`, `comment`, `follow`, `connect`

---

## X ENGAGEMENT (Like + Reply)

```
X ENGAGEMENT — Like + Reply

STEP 0: CONTEXT
Read /home/sonofanton/clawd/x-engaged.txt for engaged IDs.
Read /home/sonofanton/clawd/x-adolfo-conversations.txt for threads already replied to.

STEP 1: WARM-UP
- Run: bird home -n 8 | bird mentions -n 5
- OPTIONAL (30%): bird bookmarks -n 3

STEP 2: FIND TARGET
bird search "clawdbot OR moltbot OR openclaw" -n 30 --json
Pick ONE post not in engaged list. Note: author, preview (100 chars), language.

STEP 3: LIKE (silent)
cd /home/sonofanton/projects/clawsocial && npx tsx src/scripts/sync-bird-cookies.ts --env-file ~/.clawdbot/.env && CLAWSOCIAL_SILENT=1 npm run cli -- x like <tweet-url>

STEP 4: REPLY
bird reply <tweet-url> "your reply"

STEP 5: LOG
Append tweet ID to /home/sonofanton/clawd/x-engaged.txt

STEP 6: REPORT
cd /home/sonofanton/projects/clawsocial && npm run cli -- notify report twitter comment <tweet-url> --context='{"tweet":"<url>","author":"<username>","preview":"<100 chars>","reply":"<text>","language":"<EN/PT>","behaviors":"Warm-up ✅"}'

NO manual Telegram — ClawSocial handles it.
```

### Required Context Fields:
```json
{
  "tweet": "https://x.com/user/status/123",
  "author": "username",
  "preview": "First 100 chars of original tweet...",
  "reply": "Your reply text here",
  "language": "EN",
  "behaviors": "Warm-up ✅, Profile check ✅"
}
```

---

## X FOLLOW

```
X FOLLOW

1. Read /home/sonofanton/projects/clawsocial/db/x_state.json
2. Get first account where followed=false. If none: reply HEARTBEAT_OK
3. Count remaining unfollowed accounts for 'queueRemaining'
4. Sync cookies:
   cd /home/sonofanton/projects/clawsocial && npx tsx src/scripts/sync-bird-cookies.ts --env-file ~/.clawdbot/.env
5. Follow with FULL context (ClawSocial sends notification):
   cd /home/sonofanton/projects/clawsocial && npm run cli -- x follow [username] --context='{"username":"[username]","profileUrl":"https://x.com/[username]","followers":[count],"queueRemaining":[remaining],"behaviors":"Direct follow"}'
6. Update x_state.json: set followed=true for this account

DO NOT send manual notification — ClawSocial handles it via --context.
```

### Required Context Fields:
```json
{
  "username": "targetuser",
  "profileUrl": "https://x.com/targetuser",
  "followers": 5200,
  "queueRemaining": 12,
  "behaviors": "Direct follow"
}
```

---

## LINKEDIN CONNECTION

```
LINKEDIN CONNECTION

1. Read /home/sonofanton/projects/clawsocial/db/linkedin_state.json
2. Pick first profile where connected=false. If none: reply HEARTBEAT_OK
3. Get degree (2nd/3rd) from the state
4. Connect with FULL context (ClawSocial sends notification):
   cd /home/sonofanton/projects/clawsocial && npm run cli -- linkedin connect [url] --context='{"username":"[name]","profileUrl":"[url]","degree":"[2nd/3rd]","method":"Direct","behaviors":"Profile viewed"}'
5. Update linkedin_state.json: set connected=true for this profile

DO NOT send manual notification — ClawSocial handles it via --context.
```

### Required Context Fields:
```json
{
  "username": "John Developer",
  "profileUrl": "https://linkedin.com/in/john-developer",
  "degree": "2nd",
  "method": "Direct",
  "behaviors": "Profile viewed"
}
```

---

## LINKEDIN ENGAGEMENT

```
LINKEDIN ENGAGEMENT — Batch

1. Execute:
   cd /home/sonofanton/projects/clawsocial && npx tsx src/scripts/engage.ts --skip-search --max=4 2>&1

2. For EACH article engaged, parse output for: title, author, URL, comment text

3. Send report for EACH article:
   cd /home/sonofanton/projects/clawsocial && npm run cli -- notify report linkedin comment <url> --context='{"url":"<article-url>","articleTitle":"<title>","articleAuthor":"<author>","comment":"<your comment>","sessionInfo":"Morning batch ([X]/4)","behaviors":"Warm-up ✅"}'

NO manual Telegram — ClawSocial handles all notifications.
```

### Required Context Fields:
```json
{
  "url": "https://linkedin.com/feed/update/...",
  "articleTitle": "The Future of AI in Enterprise",
  "articleAuthor": "Sarah Chen, CTO",
  "comment": "Great insights! This is really valuable.",
  "sessionInfo": "Morning batch (2/4)",
  "behaviors": "Warm-up ✅"
}
```

---

## INSTAGRAM ENGAGEMENT

```
INSTAGRAM ENGAGEMENT

1. Execute:
   cd /home/sonofanton/projects/clawsocial && npx tsx src/scripts/ig-engage.ts --skip-scrape --max=1 2>&1

2. Parse output for: username, action, post URL, comment text

3. If failed, retry up to 3 times

4. Send report:
   cd /home/sonofanton/projects/clawsocial && npm run cli -- notify report instagram comment <post-url> --context='{"username":"<username>","postUrl":"<url or N/A>","comment":"<text>","action":"<Liked + Commented / Followed>","behaviors":"Warm-up ✅"}'

NO manual Telegram — ClawSocial handles formatting.
```

### Required Context Fields:
```json
{
  "username": "target_user",
  "postUrl": "https://instagram.com/p/ABC123",
  "comment": "Amazing work! 🔥",
  "action": "Liked + Commented",
  "behaviors": "Warm-up ✅"
}
```

---

## Command Reference

### Actions (auto-notify via --context)
```bash
# X
npm run cli -- x like <url> --context='{"author":"user","preview":"...", "language":"EN", "behaviors":"..."}'
npm run cli -- x follow <username> --context='{"username":"...","profileUrl":"...","followers":1234,"queueRemaining":10}'

# LinkedIn
npm run cli -- linkedin connect <url> --context='{"username":"...","profileUrl":"...","degree":"2nd","method":"Direct"}'

# Instagram
npm run cli -- ig comment <url> "<text>" --context='{"username":"...","postUrl":"...","comment":"...","action":"..."}'
```

### Manual Report (for combined actions)
```bash
npm run cli -- notify report twitter comment <url> --context='{"tweet":"...","author":"...","preview":"...","reply":"...","language":"EN","behaviors":"..."}'
```

### Suppress Auto-Notify
Use when you want to send a combined report later:
```bash
CLAWSOCIAL_SILENT=1 npm run cli -- x like <url>
# Then later...
npm run cli -- notify report twitter comment <url> --context='...'
```

---

## Retry System

All ClawSocial commands now include automatic retries:

```bash
# Default: 3 retries with 5s delay between attempts
npm run cli -- x like <url>

# Custom retries
npm run cli -- x like <url> --retries=5

# Disable retries
npm run cli -- x like <url> --retries=1
```

**Retry behavior:**
- Default: 3 attempts
- Delay: 5 seconds between attempts
- Max: 10 retries
- On failure: exits with code 1 + sends error notification

**Console output on retry:**
```
⚠️ Attempt 1/3 failed for X like (https://x.com/...)
   Error: Element not found
   Retrying in 5s...
```

---

## Important Rules

1. **NO manual Telegram notifications** — ClawSocial handles ALL formatting
2. **ALWAYS pass --context** with ALL required fields
3. **Use CLAWSOCIAL_SILENT=1** when action will be followed by combined report
4. **Check docs/NOTIFICATION_TEMPLATES.md** for output format
5. **Retries are automatic** — 3 attempts by default, configurable with --retries

---

## Output Examples

### X Engagement
```
🐦 **X ENGAGEMENT** ✅

**Tweet:** https://x.com/user/status/123
**Author:** @user
**Preview:** "First 100 chars of the tweet..."

**Actions:**
• ❤️ Liked: ✅
• 💬 Replied: "Your reply text here"

**Language:** EN
**Behaviors:** Warm-up ✅, Profile check ✅
**Time:** 2026-02-06 10:15:30 UTC

_ClawSocial X/Twitter Automation_
```

### X Follow
```
👥 **X FOLLOW** ✅

**Target:** @targetuser
**Profile:** https://x.com/targetuser
**Followers:** 5.2K
**Queue:** 12 accounts left

**Time:** 2026-02-06 10:15:30 UTC

_ClawSocial X/Twitter Automation_
```
