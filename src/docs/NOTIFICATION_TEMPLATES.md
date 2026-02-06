# ClawSocial Notification Templates

**MANDATORY REFERENCE** — All notifications MUST match these templates exactly.

---

## 🐦 X ENGAGEMENT REPORT

```
🐦 **X ENGAGEMENT** ✅

**Tweet:** [full URL]
**Author:** @[username]
**Preview:** "[first 100 chars of original tweet]"

**Actions:**
• ❤️ Liked: ✅
• 💬 Replied: "[your reply text]"

**Language:** [EN/PT/ES/etc]
**Behaviors:** Warm-up ✅, Profile check [✅/❌]

*ClawSocial X/Twitter Automation*
```

### Fields Required:
- `tweet` — Full tweet URL
- `author` — Username without @
- `preview` — First 100 chars of the original tweet
- `reply` — Your reply text
- `language` — Detected language code
- `behaviors` — What human-like behaviors were done

---

## 🐦 X FOLLOW REPORT

```
👥 **X FOLLOW** ✅

**Target:** @[username]
**Profile:** [full profile URL]
**Followers:** [count formatted: 1.5K, 12.3K, etc]

**Queue:** [remaining] accounts left

*ClawSocial X/Twitter Automation*
```

### Fields Required:
- `username` — Target username
- `profileUrl` — Full profile URL
- `followers` — Follower count (will be formatted)
- `queueRemaining` — How many left in queue

---

## 🔗 LINKEDIN ENGAGEMENT REPORT

```
🔗 **LINKEDIN ENGAGEMENT** ✅

**Article:** "[Title]" by [Author]
**URL:** [full article URL]

**Actions:**
• ❤️ Liked: ✅
• 💬 Commented: "[your comment text]"

**Session:** [Morning/Afternoon] batch ([X]/[total])

*ClawSocial LinkedIn Automation*
```

### Fields Required:
- `articleTitle` — Title of the article
- `articleAuthor` — Author name
- `url` — Full article URL
- `comment` — Your comment text
- `sessionInfo` — e.g. "Morning batch (2/4)"

---

## 🔗 LINKEDIN CONNECTION REPORT

```
🔗 **LINKEDIN CONNECTION** ✅

**Profile:** [username]
**URL:** [full profile URL]
**Degree:** [2nd/3rd]
**Method:** [Direct/More dropdown]

**Note:** "[connection note if any]"

*ClawSocial LinkedIn Automation*
```

### Fields Required:
- `username` — Profile username/name
- `url` — Full profile URL
- `degree` — Connection degree
- `method` — How the connect was done
- `note` — Connection note (optional)

---

## 📸 INSTAGRAM ENGAGEMENT REPORT

```
📸 **INSTAGRAM ENGAGEMENT** ✅

**Target:** @[username]
**Post:** [full post URL or "N/A"]
**Action:** [Liked + Commented] or [Followed (no posts)]

**Comment:** "[your comment text]" (if applicable)

*ClawSocial Instagram Automation*
```

### Fields Required:
- `username` — Target username
- `postUrl` — Post URL or "N/A"
- `action` — What was done
- `comment` — Comment text if commented

---

## ❌ ERROR REPORTS

Add after the header:
```
❌ **[PLATFORM] [ACTION]** ❌

**Target:** [URL or username]
**Error:** [error message]
**Attempted:** [what was tried]

*ClawSocial [Platform] Automation*
```

---

## Formatting Rules

1. **Headers:** Use `**bold**` for Telegram markdown
2. **Bullets:** Use `•` not `-`
3. **Checkmarks:** Use ✅ and ❌
4. **Footer:** Always italicized `*ClawSocial [Platform] Automation*`
5. **No extra blank lines** between fields
6. **URLs:** Full URLs, not shortened
7. **Quotes:** Wrap text in `"quotes"`

---

## CLI Usage

Pass context as JSON:
```bash
npm run cli -- x like <url> --context='{"author":"elonmusk","preview":"Tweet preview text...","language":"EN","behaviors":"Warm-up ✅, Profile check ✅"}'
```

ClawSocial formats automatically using these templates.
