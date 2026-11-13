"""복음 메시지·777 기도문 '듣기' 음성 만들기 (Azure Speech 신경망 음성).

    python scripts/tts.py --dry-run              # 낭독 원고만 만들어 글자 수 확인(.transcript-work/tts/)
    python scripts/tts.py [gospel|prayer777] [ko en ...]   # 음성 만들기 → audio/<page>/<lang>.mp3

환경 변수: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (예: koreacentral)
결과 목록은 content/audio.json 에 기록되며, 사이트는 그 목록에 있는 언어만 '듣기' 버튼을 보여 줍니다.
"""

import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio"
WORK = ROOT / ".transcript-work" / "tts"
MANIFEST = ROOT / "content" / "audio.json"

# 언어별 음성(자연스러운 신경망 음성) — 바꾸려면 여기만 고치면 됨
VOICES = {
    "ko": ("ko-KR", "ko-KR-SunHiNeural"),
    "en": ("en-US", "en-US-AvaNeural"),
    "ur": ("ur-PK", "ur-PK-UzmaNeural"),
    "zh": ("zh-CN", "zh-CN-XiaoxiaoNeural"),
    "ja": ("ja-JP", "ja-JP-NanamiNeural"),
    "fr": ("fr-FR", "fr-FR-DeniseNeural"),
    "de": ("de-DE", "de-DE-KatjaNeural"),
    "es": ("es-ES", "es-ES-ElviraNeural"),
    "ru": ("ru-RU", "ru-RU-SvetlanaNeural"),
    "km": ("km-KH", "km-KH-SreymomNeural"),
}
RATE = "-6%"  # 조금 천천히, 또박또박
PAUSE_S, PAUSE_M, PAUSE_L = "450ms", "900ms", "1600ms"

REF = re.compile(r"\[\[([1-3A-Z]{3}) (\d+):(\d+)(?:-(\d+))?\]\]")


def book_names():
    """config.js(ko/en/ur) + booknames.js(나머지 언어)에서 책 이름"""
    names = {}
    cfg = (ROOT / "assets" / "config.js").read_text("utf-8")
    for code, ko, _, en, _, ur in re.findall(r'\["([1-3A-Z]{3})", "([^"]*)", "([^"]*)", "([^"]*)", "([^"]*)", "([^"]*)"\]', cfg):
        names[code] = {"ko": ko, "en": en, "ur": ur}
    bn = (ROOT / "assets" / "booknames.js").read_text("utf-8")
    data = json.loads(bn[bn.index("{"): bn.rindex("}") + 1])
    for lang, books in data.items():
        for code, name in books.items():
            names.setdefault(code, {})[lang] = name
    return names


BOOKS = book_names()
_bible_cache = {}


def verses(lang, book, ch, v1, v2):
    p = ROOT / "bible" / lang / f"{book}.json"
    if not p.exists():
        return None  # 본문을 실을 수 없는 번역본(크메르어 등): 성구 이름만 읽음
    if p not in _bible_cache:
        _bible_cache[p] = json.loads(p.read_text("utf-8"))
    chap = _bible_cache[p].get(str(ch), {})
    txt = " ".join(chap.get(str(v), "") for v in range(v1, (v2 or v1) + 1)).strip()
    return re.sub(r"\s+", " ", re.sub(r"[\[\]{}]|\([^)]*\)", "", txt)) or None


def ref_label(lang, book, ch, v1, v2):
    name = BOOKS.get(book, {}).get(lang) or BOOKS.get(book, {}).get("en") or book
    return f"{name} {ch}:{v1}" + (f"-{v2}" if v2 else "")


def speak_text(lang, s, with_verses=True):
    """[[GEN 1:27]] 같은 성구 → '창세기 1:27. (본문)' 형태의 낭독 문장들"""
    out = []
    pos = 0
    for m in REF.finditer(s):
        before = s[pos:m.start()].replace("→", " ").strip()
        if before:
            out.append(before)
        book, ch, v1, v2 = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)) if m.group(4) else None
        label = ref_label(lang, book, ch, v1, v2)
        body = verses(lang, book, ch, v1, v2) if with_verses else None
        out.append(f"{label}. {body}" if body else label)
        pos = m.end()
    rest = s[pos:].replace("→", " ").strip()
    if rest:
        out.append(rest)
    return out


def gospel_text_script(lang):
    """전도지 원고를 읽음. 성구는 읽지 않고 건너뜀.
    낭독용 원고(content/narration/gospel-<lang>.tts.md)가 있으면 그것을 씀:
    ' / ' = 의미 단위로 짧게 쉼, ' // ' = 조금 길게 쉼 (음성이 엉뚱한 곳에서 끊지 않도록)"""
    tts = ROOT / "content" / "narration" / f"gospel-{lang}.tts.md"
    md = (tts if tts.exists() else ROOT / "content" / "gospel-text" / f"{lang}.md").read_text("utf-8")
    parts = []
    for line in md.splitlines():
        line = line.strip()
        if not line:
            parts.append(("", PAUSE_S))
            continue
        # 성구만 든 괄호 '( [[GEN 1:27]], [[ROM 3:23]] )' 통째로 지우고, 남은 표기도 지움
        line = re.sub(r"\s*[(（]\s*(\[\[[^\]]+\]\][\s,、，;]*)+[)）]", "", line)
        line = re.sub(r"\[\[[^\]]+\]\]", "", line).strip()
        if line.startswith("#"):
            parts.append((line.lstrip("#").strip(), PAUSE_L))
        elif line.startswith("- "):
            parts.append((line[2:].strip(), PAUSE_S))
        else:
            parts.append((line, PAUSE_M))
    return parts


def gospel_script(lang):
    if (ROOT / "content" / "gospel-text" / f"{lang}.md").exists():
        return gospel_text_script(lang)
    g = json.loads((ROOT / "content" / "gospel" / f"{lang}.json").read_text("utf-8"))
    parts = [(g["title"], PAUSE_S), (g.get("subtitle", ""), PAUSE_M), (g.get("intro", ""), PAUSE_L)]

    def items(lst):
        for it in lst:
            parts.append((it.get("title", ""), PAUSE_S))
            for line in speak_text(lang, it.get("body", "")):
                parts.append((line, PAUSE_S))
            parts.append(("", PAUSE_M))

    for sec in g["sections"]:
        parts.append((f'{sec.get("no", "")}. {sec["title"]}'.strip(". "), PAUSE_M))
        for line in speak_text(lang, sec.get("lead", "")):
            parts.append((line, PAUSE_M))
        items(sec.get("items", []))
        for grp in sec.get("groups", []):
            items(grp.get("items", []))
        if sec.get("note"):
            parts.append((sec["note"], PAUSE_M))
        if sec.get("prayer"):
            parts.append((sec["prayer"]["title"], PAUSE_M))
            parts.append((sec["prayer"]["body"], PAUSE_L))
        parts.append(("", PAUSE_L))
    return parts


def prayer777_script(lang):
    p = json.loads((ROOT / "content" / "prayer777" / f"{lang}.json").read_text("utf-8"))
    parts = [(p["title"], PAUSE_S), (p.get("subtitle", ""), PAUSE_L)]
    for g in p["groups"]:
        parts.append((f'{g["name"]}, {g.get("where", "")}'.strip(", "), PAUSE_L))
        for it in g["items"]:
            parts.append((it["name"], PAUSE_M))
            for line in it.get("prayer", []):
                parts.append((line, PAUSE_M))
            parts.append(("", PAUSE_M))
        parts.append(("", PAUSE_L))
    for c in p.get("closing", []):
        parts.append((c, PAUSE_M))
    return parts


SCRIPTS = {"gospel": gospel_script, "prayer777": prayer777_script}


def chunks(lang, parts, limit=2500):
    """Azure 한 번 요청 길이를 넘지 않게 문단 단위로 SSML 조각 만들기"""
    loc, voice = VOICES[lang]
    buf, size = [], 0
    for text, pause in parts:
        clean = re.sub(r"\[\[[^\]]+\]\]", "", text).strip()
        spoken = escape(clean) if clean else ""
        spoken = spoken.replace(" // ", '<break time="650ms"/>').replace("// ", '<break time="650ms"/>')
        spoken = spoken.replace(" / ", '<break time="280ms"/>')
        piece = spoken + f'<break time="{pause}"/>'
        if size + len(piece) > limit and buf:
            yield buf
            buf, size = [], 0
        buf.append(piece)
        size += len(piece)
    if buf:
        yield buf


def ssml(lang, body):
    loc, voice = VOICES[lang]
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{loc}">'
        f'<voice name="{voice}"><prosody rate="{RATE}">{"".join(body)}</prosody></voice></speak>'
    )


def synth(lang, body):
    key, region = os.environ["AZURE_SPEECH_KEY"], os.environ["AZURE_SPEECH_REGION"]
    req = urllib.request.Request(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=ssml(lang, body).encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",  # 목소리용, 1분 ≈ 0.24MB
            "User-Agent": "mahanaim-church-tts",
        },
    )
    for n in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and n < 3:  # 무료 요금제 속도 제한 → 잠시 쉬고 다시
                time.sleep(10 * (n + 1))
                continue
            raise


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    pages = [a for a in args if a in SCRIPTS] or list(SCRIPTS)
    langs = [a for a in args if a in VOICES] or list(VOICES)
    manifest = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {}
    total = 0
    for page in pages:
        for lang in langs:
            src = ROOT / "content" / page / f"{lang}.json"
            if not src.exists():
                continue
            parts = SCRIPTS[page](lang)
            pieces = list(chunks(lang, parts))
            chars = sum(len(re.sub(r"<[^>]+>", "", "".join(p))) for p in pieces)
            total += chars
            if dry:
                WORK.mkdir(parents=True, exist_ok=True)
                (WORK / f"{page}-{lang}.txt").write_text("\n".join(t for t, _ in parts if t), "utf-8")
                print(f"{page:9} {lang}: {chars:6} 글자, {len(pieces)} 조각")
                continue
            audio = b"".join(synth(lang, p) for p in pieces)
            dest = OUT / page / f"{lang}.mp3"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(audio)
            manifest.setdefault(page, [])
            if lang not in manifest[page]:
                manifest[page].append(lang)
            print(f"{page:9} {lang}: {len(audio) / 1e6:.1f}MB, 약 {len(audio) / 4000 / 60:.0f}분")
    if not dry:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"총 {total} 글자")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
