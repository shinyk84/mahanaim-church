"""강단 영상 녹취 작업 도우미.

    python scripts/transcripts.py pending [--all]    # 마지막 녹취 이후 새 영상(--all: 녹취 없는 전부)
    python scripts/transcripts.py fetch <영상ID...>   # 유튜브 한국어 자동 자막 → .transcript-work/<ID>.txt
    python scripts/transcripts.py register           # 녹취 파일·제목 번역을 content/videos/pulpit.json 에 반영

녹취 파일: content/transcripts/pulpit/<영상ID>/<언어>.md (ko, en, ur …)
제목 번역: content/transcripts/pulpit/<영상ID>/titles.json  예) {"en": "...", "ur": "..."}
우르드어 등 성구 표기는 [[ACT 1:8]] 형식이며 책 코드는 assets/config.js 기준(요한복음 JOH, 에스겔 EZE).
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "content" / "videos" / "pulpit.json"
TR = ROOT / "content" / "transcripts" / "pulpit"
WORK = ROOT / ".transcript-work"
LANG_ORDER = ["ko", "en", "ur", "zh", "ja", "fr", "de", "es", "ru"]
# 에이전트가 자주 틀리는 책 코드 → 사이트 코드
CODE_FIX = {"JHN": "JOH", "EZK": "EZE", "PHP": "PHI", "1JN": "1JO", "2JN": "2JO", "3JN": "3JO", "SNG": "SON", "NAM": "NAH", "MRK": "MAR"}


def load():
    return json.loads(VIDEOS.read_text("utf-8"))


def save(v):
    VIDEOS.write_text(json.dumps(v, ensure_ascii=False, indent=1) + "\n", "utf-8")


def pending(all_=False):
    """기본: 마지막으로 녹취한 영상 날짜 이후의 새 영상만. --all 이면 녹취 없는 영상 전부"""
    v = load()
    last = max((x["date"] for x in v if x.get("tr")), default="")
    for x in v:
        if not x.get("tr") and (all_ or x["date"] > last):
            print(f'{x["date"]}  {x["cat"]:5}  {x["id"]}  {x["title"]}')


def fetch(ids):
    from youtube_transcript_api import YouTubeTranscriptApi  # pip install youtube-transcript-api

    WORK.mkdir(exist_ok=True)
    api = YouTubeTranscriptApi()
    for vid in ids:
        t = api.fetch(vid, languages=["ko"])
        lines = [f"[{int(s.start) // 60}:{int(s.start) % 60:02d}] {s.text}" for s in t]
        (WORK / f"{vid}.txt").write_text("\n".join(lines), "utf-8")
        print(f"{vid}: {len(t)} lines, ~{round(t[-1].start / 60)} min -> {WORK / (vid + '.txt')}")


def register():
    valid = set(re.findall(r'\["([1-3A-Z]{3})"', (ROOT / "assets" / "config.js").read_text("utf-8")))
    v = load()
    for x in v:
        d = TR / x["id"]
        if not d.is_dir():
            continue
        for md in d.glob("*.md"):  # 책 코드 바로잡기
            s = md.read_text("utf-8")
            s2 = re.sub(r"\[\[([1-3A-Z]{3}) ", lambda m: f"[[{CODE_FIX.get(m.group(1), m.group(1))} ", s)
            bad = {c for c in re.findall(r"\[\[([1-3A-Z]{3}) ", s2) if c not in valid}
            if bad:
                print(f"  ! {md.relative_to(ROOT)}: 알 수 없는 책 코드 {sorted(bad)}")
            if s2 != s:
                md.write_text(s2, "utf-8")
        langs = [l for l in LANG_ORDER if (d / f"{l}.md").exists()]
        if langs:
            x["tr"] = langs
        tj = d / "titles.json"
        if tj.exists():
            x["titles"] = {**x.get("titles", {}), **json.loads(tj.read_text("utf-8"))}
        print(f'{x["date"]} {x["id"]} tr={x.get("tr")} titles={list(x.get("titles", {}))}')
    save(v)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "pending"
    {"pending": lambda: pending("--all" in sys.argv), "fetch": lambda: fetch(sys.argv[2:]), "register": lambda: register()}[cmd]()
