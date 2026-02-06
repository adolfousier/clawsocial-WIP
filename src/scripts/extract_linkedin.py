#!/usr/bin/env python3
"""Extract LinkedIn posts from saved HTML using stable patterns (URLs, data attributes)."""

import re
import json
from pathlib import Path
from html.parser import HTMLParser
from html import unescape

HTML_FILE = Path(__file__).parent.parent / "scraped" / "linkedin-page.html"
OUTPUT_FILE = Path(__file__).parent.parent / "scraped" / "extracted-posts.json"


def extract_posts(html: str) -> list[dict]:
    """Extract posts using regex on stable patterns."""
    posts = []
    
    # Extract article/pulse URLs with titles
    # Pattern: href="...linkedin.com/pulse/SLUG..." followed by title
    pulse_pattern = r'href="(https://www\.linkedin\.com/pulse/([^"]+))"[^>]*>.*?<p[^>]*>([^<]+)</p>'
    
    for match in re.finditer(pulse_pattern, html, re.DOTALL):
        url, slug, title = match.groups()
        title = unescape(title.strip())
        if title and len(title) > 5:
            posts.append({
                "type": "article",
                "url": url,
                "slug": slug,
                "title": title
            })
    
    # Extract newsletter URLs
    newsletter_pattern = r'href="(https://www\.linkedin\.com/newsletters/([^"]+))"'
    for match in re.finditer(newsletter_pattern, html):
        url, slug = match.groups()
        posts.append({
            "type": "newsletter", 
            "url": url,
            "slug": slug
        })
    
    # Extract company page references
    company_pattern = r'href="(https://www\.linkedin\.com/company/([^/"]+)/)"'
    companies = set()
    for match in re.finditer(company_pattern, html):
        url, slug = match.groups()
        if "openclaw" in slug.lower():
            companies.add((url, slug))
    
    for url, slug in companies:
        posts.append({
            "type": "company",
            "url": url,
            "slug": slug
        })
    
    # Extract profile URLs mentioned
    profile_pattern = r'href="(https://www\.linkedin\.com/in/([^/"]+)/)"'
    profiles = set()
    for match in re.finditer(profile_pattern, html):
        url, username = match.groups()
        profiles.add((url, username))
    
    # Extract hashtag mentions
    hashtag_pattern = r'keywords=%23(openclaw|clawdbot|moltbot)'
    hashtags = set(re.findall(hashtag_pattern, html, re.I))
    
    # Extract text snippets containing "openclaw"
    # Look for expandable-text-box content
    text_box_pattern = r'data-testid="expandable-text-box">([^<]+(?:<br>)?[^<]*openclaw[^<]*)'
    snippets = []
    for match in re.finditer(text_box_pattern, html, re.I | re.DOTALL):
        text = match.group(1)
        text = re.sub(r'<[^>]+>', ' ', text)  # Strip HTML
        text = unescape(text.strip())
        text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
        if len(text) > 50:
            snippets.append(text[:500])  # Truncate
    
    return {
        "articles": [p for p in posts if p["type"] == "article"],
        "newsletters": [p for p in posts if p["type"] == "newsletter"],
        "companies": [p for p in posts if p["type"] == "company"],
        "profiles": [{"url": u, "username": n} for u, n in profiles],
        "hashtags": list(hashtags),
        "snippets": snippets[:20]  # First 20 unique snippets
    }


def dedupe_articles(articles: list[dict]) -> list[dict]:
    """Remove duplicate articles by URL."""
    seen = set()
    unique = []
    for article in articles:
        if article["url"] not in seen:
            seen.add(article["url"])
            # Extract author from slug (last part before ID)
            slug_parts = article["slug"].rstrip("/").split("-")
            # Slug format: title-words-author-name-ID
            # Author is typically 2nd-to-last group before the ID
            if len(slug_parts) >= 3:
                # Try to extract author name (usually before the random ID at end)
                article["author_hint"] = "-".join(slug_parts[-3:-1]) if len(slug_parts) > 3 else slug_parts[-2]
            unique.append(article)
    return unique


def extract_author_profiles(html: str, articles: list[dict]) -> list[dict]:
    """Match article authors to their profile URLs."""
    # Map common author name patterns to profiles
    profile_map = {}
    profile_pattern = r'href="(https://www\.linkedin\.com/in/([^/"]+)/)"[^>]*>[^<]*</a>[^<]*<[^>]*>[^<]*([^<]+)'
    
    for match in re.finditer(profile_pattern, html):
        url, username, name = match.groups()
        name = unescape(name.strip())
        if name and len(name) > 2:
            profile_map[username.lower()] = {"url": url, "username": username, "name": name}
    
    return list(profile_map.values())


if __name__ == "__main__":
    print(f"Reading {HTML_FILE}...")
    html = HTML_FILE.read_text(encoding="utf-8")
    
    print("Extracting data...")
    data = extract_posts(html)
    
    # Dedupe
    data["articles"] = dedupe_articles(data["articles"])
    
    print(f"\nFound:")
    print(f"  - {len(data['articles'])} articles")
    print(f"  - {len(data['newsletters'])} newsletters")
    print(f"  - {len(data['companies'])} companies")
    print(f"  - {len(data['profiles'])} profiles")
    print(f"  - {len(data['hashtags'])} hashtags")
    print(f"  - {len(data['snippets'])} text snippets")
    
    # Save
    OUTPUT_FILE.write_text(json.dumps(data, indent=2))
    print(f"\nSaved to {OUTPUT_FILE}")
    
    # Print articles
    print("\n=== ARTICLES ===")
    for a in data["articles"]:
        author = a.get("author_hint", "unknown")
        print(f"  • {a['title']}")
        print(f"    by: {author}")
        print(f"    {a['url']}\n")
