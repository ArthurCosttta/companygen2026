"""Extrai foto de perfil e metadados públicos de um perfil do Instagram."""

import argparse
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from ddgs import DDGS

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def diagnostic(stage: str, detail: str) -> None:
    """Keep stdout as a single JSON response for the Node API."""
    print(f"[instagram:{stage}] {detail}", file=sys.stderr)


def normalize_handle(raw: str) -> str:
    text = str(raw or "").strip()
    text = re.sub(r"^https?://(?:www\.)?instagram\.com/", "", text, flags=re.I)
    text = text.split("?")[0].split("#")[0].strip("/").lstrip("@").strip()
    match = re.match(r"^[A-Za-z0-9._]{1,30}$", text)
    if not match:
        raise ValueError("Informe um @usuario valido do Instagram.")
    return match.group(0).lower()


def detect_raster_ext(blob: bytes) -> str | None:
    if len(blob) < 16 or len(blob) > 6 * 1024 * 1024:
        return None
    if blob.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if blob.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if blob.startswith(b"RIFF") and blob[8:12] == b"WEBP":
        return ".webp"
    if blob.startswith(b"GIF87a") or blob.startswith(b"GIF89a"):
        return ".gif"
    return None


def html_meta(body: str, key: str) -> str:
    """Read meta values regardless of attribute order or HTML entities."""
    for tag in re.findall(r"<meta\b[^>]*>", body, re.I | re.S):
        attrs = {
            name.lower(): html.unescape(value)
            for name, _, value in re.findall(r"([:\w-]+)\s*=\s*([\"'])(.*?)\2", tag, re.S)
        }
        if attrs.get("property", "").lower() == key or attrs.get("name", "").lower() == key:
            return attrs.get("content", "").strip()
    return ""


def download_avatar(url: str, output_dir: Path, handle: str) -> str | None:
    if not url or not re.match(r"^https?://", url, re.I):
        diagnostic("avatar", "URL de imagem ausente ou inválida")
        return None
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": "https://www.instagram.com/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            blob = resp.read(6 * 1024 * 1024 + 1)
        ext = detect_raster_ext(blob)
        if not ext:
            diagnostic("avatar", f"Resposta sem imagem raster válida: {urllib.parse.urlparse(url).hostname}")
            return None
        safe_handle = re.sub(r"[^a-z0-9._-]", "_", handle)
        output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{safe_handle}_logo{ext}"
        (output_dir / filename).write_bytes(blob)
        return filename
    except Exception as exc:
        diagnostic("avatar", f"{urllib.parse.urlparse(url).hostname}: {type(exc).__name__}: {exc}")
        return None


def fetch_instagram_api(handle: str) -> dict | None:
    api_url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={urllib.parse.quote(handle)}"
    req = urllib.request.Request(
        api_url,
        headers={
            "User-Agent": USER_AGENT,
            "X-IG-App-ID": "936619743392459",
            "Accept": "application/json",
            "Referer": f"https://www.instagram.com/{handle}/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        user = (data.get("data") or {}).get("user") or {}
        if not user:
            return None
        return {
            "fullName": str(user.get("full_name") or "").strip(),
            "bio": str(user.get("biography") or "").strip(),
            "category": str(user.get("category_name") or "").strip(),
            "photoCandidates": [
                str(user.get("profile_pic_url_hd") or user.get("profile_pic_url") or "").strip()
            ],
            "source": "instagram-api",
        }
    except Exception as exc:
        diagnostic("api", f"{type(exc).__name__}: {exc}")
        return None


def fetch_instagram_html(handle: str) -> dict | None:
    page_url = f"https://www.instagram.com/{urllib.parse.quote(handle)}/"
    req = urllib.request.Request(
        page_url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read(1024 * 1024).decode("utf-8", errors="ignore")
        og_image = html_meta(body, "og:image")
        og_title = html_meta(body, "og:title")
        description = html_meta(body, "description")
        pic_hd = re.search(r'"profile_pic_url_hd"\s*:\s*"([^"]+)"', body)
        raw_img = ""
        if pic_hd:
            raw_img = pic_hd.group(1).replace("\\u0026", "&").replace("\\/", "/")
        elif og_image:
            raw_img = og_image
        title_txt = og_title
        full_name = re.sub(r"\s*[•(].*$", "", title_txt).strip()
        if "Instagram" in full_name or "Login" in full_name:
            full_name = ""
        bio_match = re.search(r"\bon Instagram:\s*[\"“](.*?)[\"”]\s*$", description, re.I | re.S)
        bio_txt = bio_match.group(1).strip() if bio_match else ""
        if not raw_img and not full_name:
            diagnostic("html", "Página recebida sem metadados públicos de perfil")
            return None
        return {
            "fullName": full_name,
            "bio": bio_txt[:280],
            "category": "",
            "photoCandidates": [raw_img] if raw_img else [],
            "source": "instagram-html",
        }
    except Exception as exc:
        diagnostic("html", f"{type(exc).__name__}: {exc}")
        return None


def fetch_ddgs_fallback(handle: str) -> dict | None:
    full_name = ""
    bio = ""
    candidates = []
    try:
        with DDGS(timeout=8) as ddgs:
            texts = list(ddgs.text(f"instagram {handle}", region="br-pt", max_results=3))
            for item in texts:
                href = str(item.get("href") or "")
                title = str(item.get("title") or "")
                if "instagram.com" in href.lower() or handle in title.lower():
                    cleaned_name = re.sub(r"\s*[•(\-–].*$", "", title).strip()
                    if cleaned_name and "instagram" not in cleaned_name.lower():
                        full_name = cleaned_name
                    bio = str(item.get("body") or "").strip()[:260]
                    break
    except Exception as exc:
        diagnostic("ddgs.text", f"{type(exc).__name__}: {exc}")

    try:
        with DDGS(timeout=8) as ddgs:
            imgs = list(ddgs.images(f"site:instagram.com/{handle}/ {handle} profile picture", max_results=10))
            for img in imgs:
                page = str(img.get("url") or img.get("source") or "")
                if not re.search(rf"https?://(?:www\.)?instagram\.com/{re.escape(handle)}/?(?:[?#]|$)", page, re.I):
                    continue
                for key in ("image", "thumbnail"):
                    c = str(img.get(key) or "").strip()
                    if re.match(r"^https?://", c, re.I) and c not in candidates:
                        candidates.append(c)
    except Exception as exc:
        diagnostic("ddgs.images", f"{type(exc).__name__}: {exc}")

    if not candidates and not full_name and not bio:
        return None
    return {
        "fullName": full_name,
        "bio": bio,
        "category": "",
        "photoCandidates": candidates,
        "source": "ddgs",
    }


def extract_business_hints(bio):
    """Extract conservative, reviewable hints from a public bio without inventing data."""
    text = str(bio or "").strip()
    lines = [re.sub(r"\s+", " ", line).strip(" •|-\t") for line in text.splitlines() if line.strip()]
    phone_match = re.search(r"(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}", text)
    url_matches = re.findall(r"https?://[^\s|]+|(?:wa\.me|linktr\.ee|bio\.site)/[^\s|]+", text, re.I)
    hours = next((line for line in lines if re.search(r"\b(?:seg|ter|qua|qui|sex|sab|sáb|dom|hor[aá]rio|h\s*(?:às|as|-)\s*\d)", line, re.I)), "")
    address = next((line for line in lines if re.search(r"\b(?:rua|av\.?|avenida|alameda|rodovia|bairro|centro|shopping)\b", line, re.I)), "")
    ignored = {hours, address}
    differentials = [line for line in lines if line not in ignored and not re.search(r"https?://|@|\d{4}[-.\s]?\d{4}", line, re.I)][:3]
    return {
        "phone": phone_match.group(0).strip() if phone_match else "",
        "address": address,
        "hours": hours,
        "differentials": differentials,
        "links": url_matches[:5],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--handle", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    handle = normalize_handle(args.handle)
    out_dir = Path(args.output_dir)

    meta = fetch_instagram_api(handle) or fetch_instagram_html(handle)
    photo_file = None
    if meta:
        for cand in meta.get("photoCandidates") or []:
            photo_file = download_avatar(cand, out_dir, handle)
            if photo_file:
                break

    if not photo_file or not (meta and (meta.get("fullName") or meta.get("bio"))):
        fallback = fetch_ddgs_fallback(handle)
        if fallback:
            if not meta:
                meta = fallback
            else:
                if not meta.get("fullName") and fallback.get("fullName"):
                    meta["fullName"] = fallback["fullName"]
                if not meta.get("bio") and fallback.get("bio"):
                    meta["bio"] = fallback["bio"]
            if not photo_file:
                for cand in fallback.get("photoCandidates") or []:
                    photo_file = download_avatar(cand, out_dir, handle)
                    if photo_file:
                        if meta is not fallback:
                            meta["source"] = f"{meta.get('source', 'instagram')}+ddgs"
                        break

    if not meta and not photo_file:
        print(json.dumps({
            "ok": False,
            "handle": f"@{handle}",
            "error": "Nao foi possivel extrair a foto publica deste perfil. Voce pode colar a URL da logo manualmente.",
        }, ensure_ascii=False))
        return

    hints = extract_business_hints((meta or {}).get("bio", ""))
    print(json.dumps({
        "ok": bool(photo_file or (meta or {}).get("fullName") or (meta or {}).get("bio")),
        "handle": f"@{handle}",
        "fullName": (meta or {}).get("fullName", ""),
        "bio": (meta or {}).get("bio", ""),
        "category": (meta or {}).get("category", ""),
        "photoFile": photo_file or "",
        "source": (meta or {}).get("source", "unknown"),
        **hints,
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(0)
