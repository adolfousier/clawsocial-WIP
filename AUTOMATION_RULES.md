# AUTOMATION_RULES.md

## ⚠️ DISCLAIMER

This software is for **educational and experimental purposes** only.
Use at your own risk. The authors are not responsible for account
suspensions or bans resulting from misuse.

---

## Platform Status

| Platform | Status | Notes |
|----------|--------|-------|
| LinkedIn | 🟢 **Production Ready** | Full engagement + connections working |
| Instagram | 🟢 **Production Ready** | Follower scraping + engagement working |
| Twitter/X | 🟡 Use `bird` CLI | ClawSocial Twitter not tested; use [bird](https://github.com/adolfousier/bird) |

**Testing Status (as of 2026-02-04):**
- Week 1: ✅ Complete — selector bugs only, no rate limit issues
- Week 2: 🔄 In Progress — no issues so far

---

## LinkedIn (Production Ready)

### What's Working
- ✅ Login with session persistence
- ✅ Like posts
- ✅ Comment on posts (with human-like delays)
- ✅ Send messages (1st connections)
- ✅ Connection requests (2nd degree — direct button)
- ✅ Connection requests (3rd degree — via More dropdown)
- ✅ Search for posts by keyword
- ✅ Profile detection and degree identification
- ✅ Notifications on action completion

### CLI Commands
```bash
clawsocial linkedin connect <profile-url>     # Send connection request
clawsocial linkedin like <post-url>           # Like a post
clawsocial linkedin comment <post-url> "text" # Comment on post
clawsocial linkedin message <profile-url> "text" # Send DM
clawsocial linkedin search "query"            # Search posts
clawsocial linkedin engage --query "openclaw" # Full engagement session
```

### Connection Request Flow
1. Navigate to profile
2. Wait for profile header to load (retry loop, up to 10 attempts)
3. Detect button state:
   - **2nd degree**: Direct "Connect" button visible → click
   - **3rd degree**: "Connect" hidden in "More" dropdown → click More → click Connect
4. Handle connection modal (add note if provided)
5. Send request
6. Emit notification

---

## Instagram (Production Ready)

### What's Working
- ✅ Login with session persistence
- ✅ Follower scraping from target account
- ✅ Like posts
- ✅ Comment on posts
- ✅ Follow users
- ✅ Follow-back (users with no posts)
- ✅ Notifications on action completion

### CLI Commands
```bash
clawsocial instagram like <post-url>
clawsocial instagram comment <post-url> "text"
clawsocial instagram follow <username>
```

### Engagement Script
```bash
# Scrape followers and engage
cd /home/sonofanton/projects/clawsocial
npx tsx src/scripts/ig-engage.ts --max=1

# Skip scrape, use existing state
npx tsx src/scripts/ig-engage.ts --skip-scrape --max=1
```

---

## Twitter/X (Use bird CLI)

**Do not use ClawSocial for Twitter/X.** Use the `bird` CLI instead:
- Cookie-based authentication (no API needed)
- Tested for 7+ days with no errors
- Supports: timeline, mentions, search, post, reply, like, bookmarks

```bash
# Usage
bird whoami
bird home -n 8
bird mentions -n 5
bird search "clawdbot OR openclaw" -n 30
bird tweet "Hello world"
bird reply <tweet-url> "response"
```

---

## 🔥 Warm-Up Schedule (CRITICAL)

New accounts or accounts starting automation MUST warm up gradually.

### Week 1: Light Activity

| Day | Likes | Comments | Connects/Follows | DMs |
|-----|-------|----------|------------------|-----|
| 1 | 0-2 | 0 | 0 | 0 |
| 2 | 2-4 | 0-1 | 0 | 0 |
| 3 | 4-6 | 1-2 | 0-1 | 0 |
| 4 | 6-8 | 2-3 | 1-2 | 0-1 |
| 5 | 8-12 | 3-5 | 2-3 | 1-2 |
| 6 | 12-16 | 5-8 | 3-5 | 2-4 |
| 7 | 16-20 | 8-14 | 5-10 | 4-10 |

**Week 1 Maximums:** 20 likes, 14 comments, 10 connects, 10 DMs

### Weekly Progression

| Week | Likes | Comments | Connects | DMs | Increase |
|------|-------|----------|----------|-----|----------|
| 1 | 20 | 14 | 10 | 10 | Baseline |
| 2 | 25 | 18 | 13 | 13 | +25% |
| 3 | 32 | 22 | 16 | 16 | +25% |
| 4 | 40 | 28 | 20 | 20 | +25% |
| 5+ | 100 | 30 | 50 | 50 | Full |

**LinkedIn Exception:** Keep connection requests ≤15/day even at full limits.

---

## ⏰ Timing Rules (MANDATORY)

### Minimum Gaps
| Action | Minimum Gap |
|--------|-------------|
| Comments | 10 minutes |
| Connection requests | 15 minutes |
| Likes | 5 minutes |
| DMs | 10 minutes |

### Time Formatting
- ✅ **Use odd minutes:** :03, :07, :11, :17, :23, :33, :41, :47, :51, :53
- ❌ **Never use rounded:** :00, :05, :10, :15, :30, :45

### Daily Distribution
Spread actions across active hours (8am-10pm):

**Good Pattern:**
```
08:17 — 2 likes
10:33 — 1 comment, 1 like
12:07 — 1 connection request
13:41 — 2 likes, 1 comment
15:23 — 1 like
17:51 — 1 connection request
19:07 — 1 comment
21:33 — 2 likes
```

**Bad Pattern:**
```
10:00 — 10 likes
10:05 — 5 comments  
10:10 — 5 connections
```

### Delay Variation
- Never use the same delay twice in a row
- Vary between 10-25 minutes for comments
- Vary between 15-30 minutes for connections
- Random jitter on all timings

---

## 📬 Notifications

ClawSocial sends branded notifications on action completion.

### Channels
- ✅ Telegram
- ✅ Discord (webhook)
- ✅ Custom webhook

### Configuration
```bash
NOTIFY_ENABLED=true
NOTIFY_TELEGRAM_BOT_TOKEN=your_token
NOTIFY_TELEGRAM_CHAT_ID=your_chat_id
NOTIFY_BRAND_FOOTER=*ClawSocial Automation*
```

### CLI
```bash
clawsocial notify status      # Check config
clawsocial notify test        # Send test to all channels
clawsocial notify test telegram  # Test specific channel
```

### Notification Format
```
🔗 **LINKEDIN CONNECT SENT**

**Profile:** username
**URL:** https://linkedin.com/in/username/
**Degree:** 3rd

**Flow:**
• ✅ Profile loaded
• ✅ Button detection: Follow + More (no direct Connect)
• ✅ Method: More dropdown → Connect
• ✅ Connection request sent

*ClawSocial LinkedIn Automation*
```

---

## 🚨 Warning Signs

**Stop immediately if you see:**
- "Action Blocked" messages
- CAPTCHA challenges
- Temporary restrictions
- Unusual logout prompts
- Email verification requests

**Recovery:**
1. Stop all automation for 24-48 hours
2. Use account manually (browse, scroll)
3. Resume at 50% of previous limits
4. Increase by 10% weekly until stable

---

## Human-like Behavior (Built-in)

ClawSocial implements:
- **Warm-up browsing**: Scrolls feed before actions
- **Random delays**: 1.5-4s between micro-actions
- **Natural typing**: 30-100ms per character
- **Thinking pauses**: 2-5s before complex actions
- **Profile viewing**: Simulates reading before engaging
- **Button detection retry**: Waits for page load, retries up to 10x

---

## State Management

### LinkedIn State (`db/linkedin_state.json`)
```json
{
  "profiles": [
    {
      "url": "https://linkedin.com/in/username/",
      "name": "Full Name",
      "degree": "3rd",
      "connect_attempted": true,
      "connect_attempted_at": "2026-02-04T16:36:10Z",
      "connect_result": "success",
      "connect_method": "more_dropdown"
    }
  ],
  "articles": {...},
  "comments_made": [...],
  "likes_made": [...]
}
```

### Instagram State (`db/instagram_state.json`)
```json
{
  "followers": [
    {
      "username": "user123",
      "engaged": true,
      "engaged_at": "2026-02-04T08:15:00Z",
      "action": "liked+commented"
    }
  ]
}
```

---

## Cron Job Examples

### LinkedIn Connect (One-shot)
```bash
clawsocial cron add \
  --name "LinkedIn Connect (16:51)" \
  --at "2026-02-04T16:51:00Z" \
  --session isolated \
  --wake now \
  --model anthropic/claude-sonnet-4-20250514 \
  --message "LinkedIn Connect task..."
```

### Instagram Engagement (Daily)
```bash
clawsocial cron add \
  --name "IG Engage (08:15)" \
  --cron "15 8 * * *" \
  --tz UTC \
  --session isolated \
  --message "Run Instagram engagement..."
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.0.35 | 2026-02-04 | Notification system (Telegram, Discord, webhook) |
| v0.0.34 | 2026-02-04 | 3rd degree LinkedIn Connect via More dropdown |
| v0.0.33 | 2026-02-04 | LinkedIn Connect improvements |
| v0.0.32 | 2026-02-03 | Instagram engagement script |
| v0.0.31 | 2026-02-03 | LinkedIn search & engage |

---

## Contributing

Before using ClawSocial:
1. Read this file completely
2. Start with Week 1 warm-up limits
3. Test on a secondary account first
4. Report issues and findings
