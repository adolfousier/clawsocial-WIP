#!/usr/bin/env python3
"""
LinkedIn Engagement Automation

Pipeline: Query → HTML → Extract → Save → Engage

Engagement rules:
- 7 comments max per run
- Minimum 10 minutes between comments
- Random delays (10-25 min) - never same time twice
- Human simulation: scroll, like, read comments, then comment
"""

import asyncio
import json
import random
import time
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
SCRAPED_DIR = PROJECT_ROOT / "scraped"
DB_DIR = PROJECT_ROOT / "db"
STATE_FILE = DB_DIR / "linkedin_state.json"
COOKIES_FILE = PROJECT_ROOT / "config" / "linkedin_cookies.json"

# Engagement settings
MAX_COMMENTS_PER_RUN = 7
MIN_DELAY_MINUTES = 10
MAX_DELAY_MINUTES = 25
USED_DELAYS_FILE = DB_DIR / "used_delays.json"


def load_state() -> dict:
    """Load engagement state."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {
        "profiles": {},
        "articles": {},
        "comments_made": [],
        "likes_made": [],
        "last_run": None,
        "comment_times": []
    }


def save_state(state: dict):
    """Save engagement state."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str))


def load_used_delays() -> set:
    """Load previously used delay values to avoid repetition."""
    if USED_DELAYS_FILE.exists():
        data = json.loads(USED_DELAYS_FILE.read_text())
        # Only keep delays from last 24h
        cutoff = time.time() - 86400
        return {d for d, ts in data.items() if ts > cutoff}
    return set()


def save_used_delay(delay_seconds: int):
    """Save a used delay value."""
    data = {}
    if USED_DELAYS_FILE.exists():
        data = json.loads(USED_DELAYS_FILE.read_text())
    # Clean old entries
    cutoff = time.time() - 86400
    data = {k: v for k, v in data.items() if v > cutoff}
    data[str(delay_seconds)] = time.time()
    USED_DELAYS_FILE.write_text(json.dumps(data))


def get_unique_delay() -> int:
    """Generate a unique random delay in seconds (10-25 min range)."""
    used = load_used_delays()
    min_sec = MIN_DELAY_MINUTES * 60
    max_sec = MAX_DELAY_MINUTES * 60
    
    # Try to find unique delay
    for _ in range(100):
        delay = random.randint(min_sec, max_sec)
        # Add some randomness to the seconds
        delay += random.randint(0, 59)
        if str(delay) not in used:
            save_used_delay(delay)
            return delay
    
    # Fallback: just use a random delay
    return random.randint(min_sec, max_sec)


def merge_extracted_data(state: dict, extracted: dict) -> dict:
    """Merge newly extracted data into state."""
    # Add profiles
    for profile in extracted.get("profiles", []):
        username = profile["username"]
        if username not in state["profiles"]:
            state["profiles"][username] = {
                "url": profile["url"],
                "username": username,
                "first_seen": datetime.now().isoformat(),
                "engaged": False
            }
    
    # Add articles
    for article in extracted.get("articles", []):
        url_hash = hashlib.md5(article["url"].encode()).hexdigest()[:12]
        if url_hash not in state["articles"]:
            state["articles"][url_hash] = {
                "url": article["url"],
                "title": article["title"],
                "author_hint": article.get("author_hint", "unknown"),
                "first_seen": datetime.now().isoformat(),
                "liked": False,
                "commented": False
            }
    
    return state


def get_pending_articles(state: dict, limit: int = 7) -> list:
    """Get articles that haven't been commented on yet."""
    pending = []
    for url_hash, article in state["articles"].items():
        if not article.get("commented"):
            pending.append({"hash": url_hash, **article})
    
    # Shuffle for variety
    random.shuffle(pending)
    return pending[:limit]


async def human_delay(min_sec: float = 1.0, max_sec: float = 3.0):
    """Small human-like delay for actions."""
    await asyncio.sleep(random.uniform(min_sec, max_sec))


async def simulate_reading(page, seconds: float = None):
    """Simulate reading by scrolling slowly."""
    if seconds is None:
        seconds = random.uniform(5, 15)
    
    end_time = time.time() + seconds
    while time.time() < end_time:
        # Small scroll
        scroll_amount = random.randint(100, 300)
        await page.evaluate(f"window.scrollBy(0, {scroll_amount})")
        await asyncio.sleep(random.uniform(0.5, 2.0))


async def engage_with_article(page, article: dict, comment_text: str) -> dict:
    """
    Engage with a LinkedIn article:
    1. Navigate to article
    2. Scroll and read
    3. Like the article
    4. Scroll to comments
    5. Read some comments
    6. Post comment
    
    Returns engagement result.
    """
    result = {
        "url": article["url"],
        "liked": False,
        "commented": False,
        "error": None
    }
    
    try:
        # Navigate to article
        print(f"  → Navigating to: {article['title'][:50]}...")
        await page.goto(article["url"], wait_until="domcontentloaded")
        await human_delay(2, 4)
        
        # Simulate reading the article
        print("  → Reading article...")
        await simulate_reading(page, random.uniform(15, 30))
        
        # Try to like the article
        print("  → Looking for like button...")
        like_button = await page.query_selector('button[aria-label*="Like"]')
        if like_button:
            aria_pressed = await like_button.get_attribute("aria-pressed")
            if aria_pressed != "true":
                await like_button.click()
                result["liked"] = True
                print("  ✓ Liked!")
                await human_delay(1, 2)
        
        # Scroll to comments section
        print("  → Scrolling to comments...")
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.7)")
        await human_delay(2, 4)
        
        # Read some comments
        print("  → Reading comments...")
        await simulate_reading(page, random.uniform(10, 20))
        
        # Find comment box and post
        print("  → Looking for comment box...")
        
        # Try different selectors for comment input
        comment_selectors = [
            'div[data-placeholder="Add a comment…"]',
            'div.ql-editor[contenteditable="true"]',
            'div[role="textbox"][aria-label*="comment"]',
            '.comments-comment-box__form textarea',
            '.comments-comment-texteditor'
        ]
        
        comment_box = None
        for selector in comment_selectors:
            comment_box = await page.query_selector(selector)
            if comment_box:
                break
        
        if comment_box:
            await comment_box.click()
            await human_delay(0.5, 1)
            
            # Type comment slowly (human-like)
            for char in comment_text:
                await page.keyboard.type(char)
                await asyncio.sleep(random.uniform(0.03, 0.12))
            
            await human_delay(1, 2)
            
            # Find and click submit button
            submit_button = await page.query_selector('button[type="submit"], button.comments-comment-box__submit-button')
            if submit_button:
                await submit_button.click()
                result["commented"] = True
                print("  ✓ Comment posted!")
            else:
                # Try pressing Ctrl+Enter
                await page.keyboard.press("Control+Enter")
                result["commented"] = True
                print("  ✓ Comment posted (Ctrl+Enter)!")
        else:
            result["error"] = "Could not find comment box"
            print("  ✗ Comment box not found")
        
    except Exception as e:
        result["error"] = str(e)
        print(f"  ✗ Error: {e}")
    
    return result


def generate_comment(article: dict) -> str:
    """Generate a contextual comment based on article title."""
    # These are templates - customize based on context
    templates = [
        "Great insights on {topic}! This is exactly what the community needs to understand.",
        "Solid breakdown of {topic}. The security considerations are especially important.",
        "Thanks for sharing this perspective on {topic}. Looking forward to more deep dives.",
        "This is a helpful resource for anyone exploring {topic}. Well articulated!",
        "Interesting take on {topic}. The ecosystem is evolving fast and articles like this help.",
        "Appreciate the technical depth here on {topic}. Bookmarked for reference.",
        "Good overview of {topic}. Would love to see a follow-up on practical implementations.",
    ]
    
    # Extract topic from title
    title = article.get("title", "this topic")
    if "openclaw" in title.lower():
        topic = "OpenClaw"
    elif "security" in title.lower():
        topic = "AI security"
    elif "agent" in title.lower():
        topic = "AI agents"
    else:
        topic = "this"
    
    comment = random.choice(templates).format(topic=topic)
    return comment


async def run_engagement_session(
    query: str = "openclaw",
    max_comments: int = MAX_COMMENTS_PER_RUN,
    dry_run: bool = False
):
    """
    Run a full engagement session:
    1. Search LinkedIn for query
    2. Save HTML
    3. Extract data
    4. Save to state
    5. Engage with articles (like + comment) with human-like delays
    """
    from playwright.async_api import async_playwright
    
    print(f"\n{'='*60}")
    print(f"LinkedIn Engagement Session")
    print(f"Query: {query}")
    print(f"Max comments: {max_comments}")
    print(f"Dry run: {dry_run}")
    print(f"{'='*60}\n")
    
    # Load state
    state = load_state()
    state["last_run"] = datetime.now().isoformat()
    
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=False,  # Need to see for debugging/CAPTCHA
            args=["--disable-blink-features=AutomationControlled"]
        )
        
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        )
        
        # Load cookies if available
        if COOKIES_FILE.exists():
            cookies = json.loads(COOKIES_FILE.read_text())
            await context.add_cookies(cookies)
            print("✓ Loaded saved cookies")
        
        page = await context.new_page()
        
        # 1. Search LinkedIn
        search_url = f"https://www.linkedin.com/search/results/all/?keywords={query}"
        print(f"→ Searching: {search_url}")
        await page.goto(search_url, wait_until="domcontentloaded")
        await human_delay(3, 5)
        
        # Check if logged in
        if "login" in page.url or "checkpoint" in page.url:
            print("\n⚠️  Not logged in! Please log in manually...")
            print("   Press Enter when ready to continue...")
            input()
            # Save cookies after login
            cookies = await context.cookies()
            COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
            COOKIES_FILE.write_text(json.dumps(cookies, indent=2))
            print("✓ Cookies saved")
        
        # 2. Save HTML
        await simulate_reading(page, 5)  # Let page fully load
        html = await page.content()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        html_file = SCRAPED_DIR / f"linkedin_{query}_{timestamp}.html"
        html_file.write_text(html)
        print(f"✓ Saved HTML: {html_file.name}")
        
        # 3. Extract data (reuse existing extractor)
        from extract_linkedin import extract_posts, dedupe_articles
        extracted = extract_posts(html)
        extracted["articles"] = dedupe_articles(extracted["articles"])
        
        # Save extracted data
        extracted_file = SCRAPED_DIR / f"extracted_{query}_{timestamp}.json"
        extracted_file.write_text(json.dumps(extracted, indent=2))
        print(f"✓ Extracted: {len(extracted['articles'])} articles, {len(extracted['profiles'])} profiles")
        
        # 4. Merge into state
        state = merge_extracted_data(state, extracted)
        save_state(state)
        print(f"✓ State updated: {len(state['articles'])} total articles, {len(state['profiles'])} profiles")
        
        # 5. Engage with articles
        pending = get_pending_articles(state, max_comments)
        print(f"\n→ {len(pending)} articles pending engagement")
        
        if dry_run:
            print("\n[DRY RUN] Would engage with:")
            for i, article in enumerate(pending):
                delay = get_unique_delay()
                print(f"  {i+1}. {article['title'][:50]}...")
                print(f"     Delay: {delay//60}m {delay%60}s")
            await browser.close()
            return
        
        # Engage with each article
        comments_made = 0
        for i, article in enumerate(pending):
            if comments_made >= max_comments:
                break
            
            print(f"\n{'─'*40}")
            print(f"[{i+1}/{len(pending)}] Engaging with article...")
            
            # Generate comment
            comment = generate_comment(article)
            print(f"  Comment: {comment[:60]}...")
            
            # Engage
            result = await engage_with_article(page, article, comment)
            
            # Update state
            if result["liked"]:
                state["likes_made"].append({
                    "url": article["url"],
                    "timestamp": datetime.now().isoformat()
                })
            
            if result["commented"]:
                comments_made += 1
                state["comments_made"].append({
                    "url": article["url"],
                    "comment": comment,
                    "timestamp": datetime.now().isoformat()
                })
                state["articles"][article["hash"]]["commented"] = True
            
            if result["liked"]:
                state["articles"][article["hash"]]["liked"] = True
            
            save_state(state)
            
            # Wait before next comment (human-like delay)
            if i < len(pending) - 1 and comments_made < max_comments:
                delay = get_unique_delay()
                print(f"\n⏳ Waiting {delay//60}m {delay%60}s before next engagement...")
                await asyncio.sleep(delay)
        
        print(f"\n{'='*60}")
        print(f"Session complete!")
        print(f"  Comments made: {comments_made}")
        print(f"  Total in state: {len(state['comments_made'])} comments, {len(state['likes_made'])} likes")
        print(f"{'='*60}")
        
        # Save cookies at end
        cookies = await context.cookies()
        COOKIES_FILE.write_text(json.dumps(cookies, indent=2))
        
        await browser.close()


if __name__ == "__main__":
    import sys
    
    query = sys.argv[1] if len(sys.argv) > 1 else "openclaw"
    dry_run = "--dry-run" in sys.argv
    
    asyncio.run(run_engagement_session(query=query, dry_run=dry_run))
