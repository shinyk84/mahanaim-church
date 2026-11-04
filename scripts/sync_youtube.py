"""유튜브 채널의 새 영상을 content/videos/<pulpit|hq>.json 에 추가합니다.

    python scripts/sync_youtube.py

- 영상 파일은 저장하지 않고 영상 ID·제목·날짜·분류만 저장합니다(썸네일·재생은 유튜브).
- 분류는 영상 제목의 표시(주일1부, 평일새벽, 산업선교 …)로 자동 판단합니다.
- 이미 있는 영상은 건드리지 않으므로, JSON에서 손으로 고친 분류(cat)·제목은 유지됩니다.
- 목록에서 빼고 싶은 영상은 JSON의 "hidden": true 로 숨깁니다(지우면 다음 동기화 때 다시 들어옴).
- 출처: 채널 RSS(최근 15개) + 채널 동영상/라이브 탭(최근 약 30개씩). 탭 읽기가 실패해도 RSS만으로 동작.
GitHub Actions(.github/workflows/sync-youtube.yml)가 매일 자동 실행합니다.
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "videos"
UA = {"User-Agent": "Mozilla/5.0 (church-site sync)", "Accept-Language": "ko-KR,ko;q=0.9"}
KST = timezone(timedelta(hours=9))


def squash(s):
    return re.sub(r"\s+", "", s)


# 두 채널 공통: 전체예배(설교만 따로 올린 영상과 중복)·쇼츠는 넣지 않음
COMMON_SKIP = ("전체예배", "예배전체", "#shorts")


def skipped(title, extra=()):
    s = squash(title).lower()
    return any(k.lower() in s for k in COMMON_SKIP + extra)


def cat_pulpit(title):
    s = squash(title)
    if skipped(title) or "헌신예배전체" in s:
        return None
    if "새벽" in s:
        return "dawn"
    if "주일1부" in s:
        return "s1"
    if "주일2부" in s:
        return "s2"
    return "etc"


HQ_SKIP = ()


def cat_hq(title):
    s = squash(title)
    if skipped(title, HQ_SKIP):
        return None
    for key, cat in (
        ("RUTC뉴스", "news"),
        ("구역공과", "lesson"),
        ("송구영신", "newyear"),
        ("WRC", "wrc"),
        ("산업선교", "industry"),
        ("렘넌트와TCK", "remnant"),
        ("TCK", "remnant"),
        ("흩어진제자", "scattered"),
        ("핵심", "core"),
        ("주일1부", "s1"),
        ("주일2부", "s2"),
    ):
        if key in s:
            return cat
    return "etc"


CHANNELS = {
    "pulpit": {"handle": "themahanaim", "id": "UCi_T8LTlNPYaSSJcxaIEnUQ", "classify": cat_pulpit},
    "hq": {"handle": "rutctv", "id": "UCquoY7mZYzen5TDY3Bep8uA", "classify": cat_hq},
}


def get(url, tries=3):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(3 * (n + 1))


def from_rss(ch):
    try:
        x = get(f"https://www.youtube.com/feeds/videos.xml?channel_id={ch['id']}")
    except Exception as e:  # 클라우드 서버에서는 가끔 404 → 채널 탭으로 계속
        print(f"  ! {ch['handle']} RSS 읽기 실패: {e}", file=sys.stderr)
        return []
    out = []
    for e in re.findall(r"<entry>(.*?)</entry>", x, re.S):
        vid = re.search(r"<yt:videoId>(.*?)<", e).group(1)
        title = unescape(re.search(r"<title>(.*?)</title>", e, re.S).group(1))
        pub = datetime.fromisoformat(re.search(r"<published>(.*?)<", e).group(1)).astimezone(KST)
        out.append((vid, title, pub.strftime("%Y-%m-%d")))
    return out


def lockups(data):
    for lv in walk(data, "lockupViewModel"):
        vid = lv.get("contentId")
        title = lv.get("metadata", {}).get("lockupMetadataViewModel", {}).get("title", {}).get("content")
        if vid and title and lv.get("contentType", "LOCKUP_CONTENT_TYPE_VIDEO") == "LOCKUP_CONTENT_TYPE_VIDEO":
            yield (vid, title, None)


def next_token(data):
    for c in walk(data, "continuationItemRenderer"):
        tok = c.get("continuationEndpoint", {}).get("continuationCommand", {}).get("token")
        if tok:
            return tok
    return None


def from_tabs(ch, since=None):
    """채널 동영상/라이브 탭. since(YYYY-MM-DD)를 주면 그 날짜 이전 영상이 나올 때까지 더 불러옴."""
    out = []
    for tab in ("videos", "streams"):
        try:
            x = get(f"https://www.youtube.com/@{ch['handle']}/{tab}")
            data = json.loads(re.search(r"var ytInitialData = (\{.*?\});</script>", x, re.S).group(1))
            key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', x).group(1)
            ver = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', x).group(1)
        except Exception as e:  # 페이지 구조가 바뀌어도 RSS로 계속 동작
            print(f"  ! {ch['handle']}/{tab} 읽기 실패: {e}", file=sys.stderr)
            continue
        page = list(lockups(data))
        out += page
        tok = next_token(data)
        for _ in range(60):  # 안전장치
            dates = [d for d in (date_in_title(t) for _, t, _ in page) if d]
            if not since or not tok or (dates and min(dates) < since):
                break
            try:
                body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": ver, "hl": "ko"}}, "continuation": tok}).encode()
                req = urllib.request.Request(
                    f"https://www.youtube.com/youtubei/v1/browse?key={key}", data=body, headers={**UA, "Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.loads(r.read().decode("utf-8"))
            except Exception as e:
                print(f"  ! {ch['handle']}/{tab} 더 불러오기 실패: {e}", file=sys.stderr)
                break
            page = list(lockups(data))
            out += page
            tok = next_token(data)
    return out


def walk(o, key):
    if isinstance(o, dict):
        if key in o:
            yield o[key]
        for v in o.values():
            yield from walk(v, key)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v, key)


def unescape(s):
    return s.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")


def date_in_title(title):
    m = re.search(r"(20\d\d)\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일", title) or re.search(
        r"(20\d\d)\.\s*(\d{1,2})\.\s*(\d{1,2})", title
    )
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None


def clean(title):
    """화면용 제목과 설교자: 날짜·[LIVE]·[4K]·교회명 등 군더더기 제거"""
    t = re.sub(r"\[[^\]]*(LIVE|4K|HD)[^\]]*\]", "", title, flags=re.I)  # [🔴LIVE] [ 4K ]
    t = re.sub(r"20\d\d\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일", "", t)
    t = re.sub(r"20\d\d\.\s*\d{1,2}\.\s*\d{1,2}\.?", "", t)
    t = t.replace("📖", "")
    parts = [p.strip() for p in t.split("|")]
    preacher = next((p for p in parts[1:] if re.search(r"(목사|선교사|전도사|강사)$", p)), None)
    if not preacher:  # "… _신윤경"
        m = re.search(r"\s*_\s*([^_]+)$", parts[0])
        if m:
            preacher, parts[0] = m.group(1).strip(), parts[0][: m.start()]
    main = re.sub(r"\s+", " ", parts[0]).strip()
    m = re.match(r"[^「]*「([^」]+)」\s*(.*)$", main)  # "주일2부 「도단성을 건축하라」 (왕하 6:14-17)" → 분류명은 배지로
    if m:
        main = f"{m.group(1)} {m.group(2)}".strip()
    return main or title.strip(), preacher


def sync(kind, since=None):
    ch = CHANNELS[kind]
    path = OUT / f"{kind}.json"
    videos = json.loads(path.read_text("utf-8")) if path.exists() else []
    before = len(videos)
    # 제외 규칙이 바뀌면 이미 들어간 영상에도 적용
    videos = [v for v in videos if "yt" not in v or ch["classify"](v["yt"]) is not None]
    removed = before - len(videos)
    have = {v["id"] for v in videos}
    found = {}
    for vid, title, pub in from_rss(ch) + from_tabs(ch, since):
        if vid not in found or (pub and not found[vid][1]):
            found[vid] = (title, pub)
    added = 0
    for vid, (yt, pub) in found.items():
        if vid in have:
            continue
        cat = ch["classify"](yt)
        if cat is None:
            continue
        date = date_in_title(yt) or pub
        if not date or (since and date < since):
            continue  # 날짜를 알 수 없으면 다음 RSS 때 추가
        title, preacher = clean(yt)
        v = {"id": vid, "date": date, "cat": cat, "title": title}
        if preacher:
            v["preacher"] = preacher
        v["yt"] = yt  # 원래 유튜브 제목(분류 확인용)
        videos.append(v)
        added += 1
    videos.sort(key=lambda v: (v["date"], v["id"]), reverse=True)
    OUT.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(videos, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"{kind}: +{added}{f' -{removed}' if removed else ''} (총 {len(videos)})")
    return added


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    # 과거 영상 채우기: python scripts/sync_youtube.py hq 2026-09-01
    if len(sys.argv) > 1:
        sync(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        sync("pulpit")
        sync("hq")
