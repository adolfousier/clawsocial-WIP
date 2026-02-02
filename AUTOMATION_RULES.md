# AUTOMATION_RULES.md

## ⚠️ WARNING

This software is for **educational and experimental purposes** only.
Use at your own risk. The authors are not responsible for account
suspensions or bans resulting from misuse.

---

## Platform Status

| Platform | Status | Recommendation |
|----------|--------|----------------|
| Twitter/X | 🟡 Use `bird` CLI | ClawSocial Twitter not tested; use [bird](https://github.com/adolfousier/bird) instead |
| Instagram | 🔴 Experimental | Auth + basic actions tested; **DO NOT USE IN PRODUCTION** |
| LinkedIn | 🔴 Experimental | Auth + basic actions tested; **DO NOT USE IN PRODUCTION** |

---

## Twitter/X Recommendations

**Do not use ClawSocial for Twitter/X.** Use the `bird` CLI instead:
- Cookie-based authentication (no API needed)
- Tested for 5+ days with no errors
- Supports: read timeline, mentions, search, post, reply, like

```bash
# Install bird
npm install -g bird-cli

# Set up (get cookies from browser)
export AUTH_TOKEN="your_auth_token"
export CT0="your_ct0"

# Usage
bird whoami
bird home
bird search "query"
bird tweet "Hello world"
bird reply <tweet-url> "response"
```

---

## Instagram Rules (EXPERIMENTAL)

**Status:** Basic auth, DM, like, comment tested. Not production-ready.

### What's Working
- [x] Login with session persistence
- [x] Like posts
- [x] Comment on posts
- [x] Send DMs

### What's NOT Tested
- [ ] Follow/unfollow
- [ ] Profile scraping
- [ ] Hashtag/search scraping
- [ ] Extended automation sessions
- [ ] Rate limit edge cases

### Known Risks
- Instagram has aggressive bot detection
- Session cookies expire frequently
- No proxy support yet
- No fingerprint randomization

### Recommended Wait
**Do not use for automation until:**
1. Proxy support implemented
2. Fingerprint rotation added
3. Extended testing (7+ days) completed
4. Rate limit verification done

---

## LinkedIn Rules (EXPERIMENTAL)

**Status:** Basic auth, DM, like, comment tested. Not production-ready.

### What's Working
- [x] Login with MFA support
- [x] Like posts
- [x] Comment on posts
- [x] Send messages (1st connections only)
- [x] Connection requests

### What's NOT Tested
- [ ] Profile scraping
- [ ] Search/hashtag scraping
- [ ] Extended automation sessions
- [ ] Connection acceptance rate
- [ ] Rate limit edge cases

### Known Risks
- LinkedIn restricts automation heavily
- Account restrictions are common
- No proxy support yet
- Selectors may break with UI updates

### Recommended Wait
**Do not use for automation until:**
1. Proxy support implemented
2. Extended testing (7+ days) completed
3. Rate limit verification done
4. Selector stability confirmed

---

## Human-like Behavior (All Platforms)

ClawSocial implements:
- **Warm-up browsing**: Scrolls feed 3-5 times before any action
- **Random delays**: 1.5-4s between actions
- **Natural typing**: 30-100ms per character
- **Thinking pauses**: 2-5s before complex actions
- **Action cooldown**: 2-3 min recommended between different actions

---

## Data Storage

**Current:** No scraping/storage implemented.

**Planned:**
- Safe local storage for scraped profiles
- Encrypted storage for interaction targets
- No network exfiltration of scraped data

---

## Rate Limits (Configured Defaults)

| Platform | Like/day | Comment/day | Follow/day | DM/day |
|----------|----------|-------------|------------|--------|
| Instagram | 100 | 30 | 50 | 50 |
| LinkedIn | 100 | 30 | 15* | 40 |
| Twitter | 100 | - | 50 | - |

*Connection requests

These are conservative defaults. Actual safe limits may be lower.

---

## Contributing

Before using ClawSocial for any platform automation:
1. Read this file completely
2. Understand the risks
3. Test on a secondary account first
4. Report issues and findings
