"""Busca e ordena os resultados reais do DDGS para o catálogo."""

import argparse
import json
import math
import re
import sys
import unicodedata
from urllib.parse import urlsplit

from ddgs import DDGS
from ddgs.exceptions import DDGSException


def words(text):
    text = unicodedata.normalize("NFKD", text.casefold())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return set(re.findall(r"[a-z0-9]+", text)) - {"de", "da", "do", "e", "a", "o", "com", "para"}


def is_web_url(url):
    if not isinstance(url, str):
        return False
    parts = urlsplit(url)
    return parts.scheme in ("https", "http") and bool(parts.hostname)


def dimension(value):
    try:
        return max(0, int(value))
    except (ValueError, TypeError):
        return 0


def hunt_images(ddgs, query, count):
    terms = words(query)
    try:
        images = ddgs.images(query, region="br-pt", safesearch="moderate",
                             max_results=max(15, count), backend="duckduckgo, bing")
    except DDGSException as error:
        if "no results found" in str(error).lower():
            return []
        raise

    candidates = []
    seen = set()
    for image in images:
        url = image.get("image")
        if not is_web_url(url) or url in seen:
            continue
        seen.add(url)
        title = image.get("title") or ""
        thumbnail = image.get("thumbnail")
        width, height = dimension(image.get("width")), dimension(image.get("height"))
        relevance = len(terms & words(title)) / max(1, len(terms))
        resolution = min(1, math.sqrt(width * height) / 1080)
        aspect = min(width, height) / max(width, height) if width and height else 0
        quality = 0.65 * relevance + 0.25 * resolution + 0.10 * aspect
        if width and height and min(width, height) < 400:
            quality *= 0.5
        candidates.append((quality, {
            "rawUrl": url,
            "thumbnailUrl": thumbnail if is_web_url(thumbnail) else url,
            "titleSnippet": title,
            "sourceDomain": image.get("source") or urlsplit(url).hostname,
            "declaredWidth": width,
            "declaredHeight": height,
            "mediaType": "image",
        }))
    return [item for _, item in sorted(candidates, key=lambda entry: entry[0], reverse=True)[:count]]


def hunt_videos(ddgs, query, count):
    results = ddgs.text(f"{query} reels site:youtube.com/shorts", max_results=count)
    candidates = []
    for result in results:
        url = result.get("href") or ""
        match = re.search(r"^https?://(?:www\.)?youtube\.com/shorts/([\w-]{11})", url)
        if match:
            candidates.append({
                "rawUrl": url,
                "videoUrl": url,
                "thumbnailUrl": f"https://i.ytimg.com/vi/{match[1]}/hqdefault.jpg",
                "titleSnippet": result.get("title", ""),
                "sourceDomain": "youtube.com",
                "mediaType": "video",
            })
    return candidates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", required=True)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--media-type", default="image", choices=("image", "video", "all"))
    args = parser.parse_args()
    query = " ".join(args.query.split())
    if not query:
        parser.error("query vazia")
    count = min(10, max(1, args.count))
    try:
        with DDGS(timeout=8) as ddgs:
            results = hunt_images(ddgs, query, count) if args.media_type != "video" else []
            if args.media_type != "image" and len(results) < count:
                results += hunt_videos(ddgs, query, count - len(results))
    except DDGSException as error:
        print(error, file=sys.stderr)
        return 1
    print(json.dumps(results, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
