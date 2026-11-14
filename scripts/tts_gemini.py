"""복음 메시지·777 기도문 '듣기' 음성 — Google Gemini TTS (문맥을 이해하는 AI 음성).

    python scripts/tts_gemini.py gospel ko          # 한 언어
    python scripts/tts_gemini.py gospel             # 10개 언어 모두
    python scripts/tts_gemini.py prayer777 ko en

환경 변수(.env): GEMINI_API_KEY, (선택) GEMINI_TTS_MODEL   필요: pip install lameenc
결과: audio/<page>/<lang>.mp3, 목록은 content/audio.json (사이트는 목록에 있는 언어만 '듣기' 버튼 표시)

품질을 위해:
- 소제목 단위로 짧게 나눠 만듦(길게 한 번에 읽히면 뒤로 갈수록 목소리·읽는 방식이 흐트러짐)
- "(5)" 같은 번호는 미리 그 언어의 서수("다섯째," "Fifth,")로 바꿔서 보냄
- 조각마다 받아쓰기(gemini-3.5-transcribe)로 원고와 비교해 많이 다르면 그 조각만 다시 만듦
- 조각 앞뒤 무음과 끝에 붙는 짧은 잡음을 잘라 내고 끝을 부드럽게 줄임
- 지시문은 보내지 않음(원고 앞에 붙이면 지시문까지 소리로 읽음)
- 조각마다 목소리가 달라지지 않게: 매번 같은 seed·낮은 temperature로 만들고,
  목소리 높낮이(음높이)가 첫 조각과 많이 다르면 그 조각만 다시 만듦
- 만든 조각은 .transcript-work/tts/에 저장 → 하루 한도에 걸려 멈춰도 다음날 이어서 만듦

    python scripts/tts_gemini.py gospel ko --draft  # 시험본: audio/drafts/에만 저장(사이트는 그대로)
    python scripts/tts_gemini.py gospel ko --whole  # 조각으로 나누지 않고 한 번에(목소리 이음새 없음)
"""

import base64
from array import array
import difflib
import json
import os
import re
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import lameenc

ROOT = Path(__file__).resolve().parent.parent
for _l in (ROOT / ".env").read_text("utf-8").splitlines() if (ROOT / ".env").exists() else []:
    if "=" in _l and not _l.lstrip().startswith("#"):
        _k, _v = _l.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip().strip('"'))
WORK = ROOT / ".transcript-work" / "tts"
OUT = ROOT / "audio"
MANIFEST = ROOT / "content" / "audio.json"
MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")  # 무료 한도: flash 하루 10번 → 막히면 gemini-3.8-flash-lite-tts
CHECK_MODEL = "gemini-3.5-transcribe"
VOICE = os.environ.get("GEMINI_TTS_VOICE", "Sulafat")  # 따뜻한 여성 음성. 다른 후보: Kore, Aoede, Achernar, Charon(남성)
SEED = 7  # 매번 같은 seed → 조각마다 목소리가 덜 달라짐
RATE = 24000  # 출력: 24kHz 16비트 모노 PCM
LANGS = ["ko", "en", "ur", "zh", "ja", "fr", "de", "es", "ru", "km"]

# "(1)" → 각 언어의 서수
ORD = {
    "ko": ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째", "일곱째"],
    "en": ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh"],
    "ur": ["پہلا", "دوسرا", "تیسرا", "چوتھا", "پانچواں", "چھٹا", "ساتواں"],
    "zh": ["第一", "第二", "第三", "第四", "第五", "第六", "第七"],
    "ja": ["第一に", "第二に", "第三に", "第四に", "第五に", "第六に", "第七に"],
    "fr": ["Premièrement", "Deuxièmement", "Troisièmement", "Quatrièmement", "Cinquièmement", "Sixièmement", "Septièmement"],
    "de": ["Erstens", "Zweitens", "Drittens", "Viertens", "Fünftens", "Sechstens", "Siebtens"],
    "es": ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Séptimo"],
    "ru": ["Во-первых", "Во-вторых", "В-третьих", "В-четвёртых", "В-пятых", "В-шестых", "В-седьмых"],
    "km": ["ទីមួយ", "ទីពីរ", "ទីបី", "ទីបួន", "ទីប្រាំ", "ទីប្រាំមួយ", "ទីប្រាំពីរ"],
}
COMMA = {"zh": "，", "ja": "、", "ur": "، ", "km": " "}


def clean(lang, line):
    line = re.sub(r"\[\[[^\]]+\]\]", "", line)  # 성구는 읽지 않음
    line = re.sub(r"\s*[(（]\s*[,、，\s]*[)）]", "", line)
    m = re.match(r"^[(（](\d)[)）]\s*(.*)$", line.strip())
    if m and 1 <= int(m.group(1)) <= 7:
        line = ORD[lang][int(m.group(1)) - 1] + COMMA.get(lang, ", ") + m.group(2)
    return re.sub(r"\s{2,}", " ", line).strip()


def gospel_chunks(lang):
    """전도지 원고를 소제목 단위 조각으로"""
    md = (ROOT / "content" / "gospel-text" / f"{lang}.md").read_text("utf-8")
    chunks, cur = [], []
    for raw in md.splitlines():
        if raw.startswith("## ") and cur:
            chunks.append("\n".join(cur))
            cur = []
        text = raw[2:] if raw.startswith("- ") else raw.lstrip("#").strip()
        line = clean(lang, text)
        if line:
            cur.append(line)
    if cur:
        chunks.append("\n".join(cur))
    return chunks


STOP = {"zh": "。", "ja": "。", "ur": "۔", "km": "។"}
SAY = {"ko": {"237": "이삼칠", "5력": "오력", "CVDIP": "씨브이디아이피", "10가지": "열 가지", "5가지": "다섯 가지",
              "9가지": "아홉 가지", "7망대": "칠망대", "7여정": "칠여정", "7이정표": "칠이정표"}}


def prayer777_chunks(lang):
    """기도 문구만 읽음(제목·소제목·항목 이름은 읽지 않음). 항목마다 조각을 나눠 그 사이에서 잠깐 쉬게 함.
    문구 끝에 마침표가 없으면 붙여서 줄마다 끊어 읽게 함"""
    p = json.loads((ROOT / "content" / "prayer777" / f"{lang}.json").read_text("utf-8"))
    end = lambda x: x if re.search(r"[.!?。！？۔។]$", x) else x + STOP.get(lang, ".")
    def say(x):  # 숫자·약어를 교회에서 부르는 대로 읽게
        for a, b in SAY.get(lang, {}).items():
            x = x.replace(a, b)
        return x

    chunks = []
    for g in p["groups"]:
        for it in g["items"]:
            lines = [say(end(clean(lang, x))) for x in it.get("prayer", []) if clean(lang, x)]
            if lines:
                chunks.append("\n".join(lines))
    if p.get("closing"):
        chunks.append("\n".join(say(end(x)) for x in p["closing"]))
    return chunks


CHUNKS = {"gospel": gospel_chunks, "prayer777": prayer777_chunks}


def post(model, body, timeout=300):
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
    )
    for n in range(6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")
            if e.code == 429 and "free_tier_requests" in msg and "PerDay" in msg:
                (ROOT / ".transcript-work" / "last-429.json").write_text(msg, "utf-8")
                raise SystemExit(f"[{model}] 오늘 무료 사용 횟수를 다 썼습니다. 내일 다시 실행하거나 다른 모델(GEMINI_TTS_MODEL)을 쓰세요.")
            if e.code in (429, 500, 503) and n < 5:
                wait = 15 * (n + 1)
                print(f"    ({e.code}) {wait}초 기다렸다 다시 시도…", flush=True)
                time.sleep(wait)
                continue
            raise SystemExit(f"[{model}] 오류 {e.code}: {msg[:300]}")


def synth(text, seed=None):
    d = post(MODEL, {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {"responseModalities": ["AUDIO"], "seed": SEED if seed is None else seed, "temperature": 0.3, "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}}},
    })
    pcm = pcm_only(base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]))
    print(f"      (받은 소리 {len(pcm) / 2 / RATE:.0f}초)", flush=True)
    return pcm


def pcm_only(data):
    """모델에 따라 WAV 파일(머리말 + 소리 + 끝 정보)로 오기도 함 → 소리(data) 부분만.
    머리말·끝 정보를 소리로 이어 붙이면 조각마다 '찌직' 잡음이 남."""
    if data[:4] != b"RIFF":
        return data
    i = 12
    while i + 8 <= len(data):
        cid, size = data[i:i + 4], int.from_bytes(data[i + 4:i + 8], "little")
        if cid == b"data":
            return data[i + 8:i + 8 + size]
        i += 8 + size + (size & 1)
    return data[44:]


def soften(pcm, cutoff=7500.0):
    """'습니다'의 ㅅ 같은 소리가 날카롭게 깨져 '찌직'처럼 들리는 것 완화: 8kHz 근처 이상만 부드럽게 깎음(2차 저역 통과)"""
    import math

    n = len(pcm) // 2
    x = array("h", pcm[: n * 2])
    w0 = 2 * math.pi * cutoff / RATE
    alpha = math.sin(w0) / (2 * 0.7071)
    cw = math.cos(w0)
    b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
    a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = array("h", bytes(2 * n))
    x1 = x2 = y1 = y2 = 0.0
    for i in range(n):
        v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x[i], y1, v
        y[i] = max(-32768, min(32767, int(v)))
    return y.tobytes()


def normalize(pcm, peak=27000):
    """찌그러짐(클리핑) 방지: 가장 큰 소리가 peak를 넘지 않게 낮춤"""
    n = len(pcm) // 2
    s = array("h", pcm[: n * 2])
    m = max((abs(x) for x in s), default=0)
    if m <= peak:
        return pcm
    k = peak / m
    return array("h", (int(x * k) for x in s)).tobytes()


def trim(pcm):
    """앞뒤 무음과, 끝에 따로 떨어져 붙은 짧은 잡음(치직)을 잘라 내고 끝을 부드럽게"""
    n = len(pcm) // 2
    s = array("h", pcm[: n * 2])
    fr = RATE // 50  # 20ms
    rms = [(sum(x * x for x in s[i:i + fr]) / fr) ** 0.5 for i in range(0, n - fr, fr)]
    if not rms:
        return pcm
    loud = [r > 700 for r in rms]
    # 소리 구간 목록
    segs, start = [], None
    for i, l in enumerate(loud + [False]):
        if l and start is None:
            start = i
        elif not l and start is not None:
            segs.append([start, i])
            start = None
    if not segs:
        return pcm
    # 끝쪽: 0.3초 이상 조용한 뒤 0.25초 미만으로 짧게 튀는 소리 = 잡음 → 버림
    while len(segs) > 1 and segs[-1][1] - segs[-1][0] < 13 and segs[-1][0] - segs[-2][1] >= 15:
        segs.pop()
    a = max(0, segs[0][0] - 5) * fr  # 앞 0.1초 여유
    b = min(n, (segs[-1][1] + 12) * fr)  # 뒤 0.24초 여유
    out = array("h", s[a:b])
    fin = min(len(out), RATE // 50)  # 시작 20ms 페이드인(이어 붙인 자리 '틱' 방지)
    for i in range(fin):
        out[i] = int(out[i] * i / fin)
    fade = min(len(out), RATE // 12)  # 끝 80ms 페이드아웃
    for i in range(fade):
        out[-fade + i] = int(out[-fade + i] * (1 - i / fade))
    return out.tobytes()


def to_mp3(pcm):
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


def pitch(pcm):
    """목소리 높낮이(Hz)의 중간값. 소리 나는 구간 일부만 골라 자기상관으로 계산(8kHz로 줄여서)"""
    n = len(pcm) // 2
    s = array("h", pcm[: n * 2])[::3]  # 24k → 8k
    W, lo, hi = 320, 20, 100  # 40ms 창, 80~400Hz
    frames = [i for i in range(0, len(s) - W - hi, 400) if sum(abs(x) for x in s[i:i + W:4]) / (W / 4) > 1500]
    step = max(1, len(frames) // 200)
    f0 = []
    for i in frames[::step]:
        x = s[i:i + W + hi]
        e = sum(x[j] * x[j] for j in range(0, W, 2)) or 1
        best, lag = 0, 0
        for L in range(lo, hi):
            c = sum(x[j] * x[j + L] for j in range(0, W, 2))
            if c > best:
                best, lag = c, L
        if best / e > 0.5:
            f0.append(8000 / lag)
    f0.sort()
    return f0[len(f0) // 2] if f0 else None


def steadiness(pcm, win=10):
    """한 번에 길게 만든 녹음 안에서 목소리가 바뀌는지: 10초마다 음높이를 재서 중간값과 가장 많이 다른 정도(0~1)"""
    R = RATE * win
    f0 = [pitch(pcm[2 * k:2 * (k + R)]) for k in range(0, len(pcm) // 2 - RATE * 5, R)]
    f0 = sorted(x for x in f0 if x)
    if len(f0) < 3:
        return 0
    mid = f0[len(f0) // 2]
    return max(abs(x / mid - 1) for x in f0)


def widen(pcm, long_gap=0.65, add_long=0.45, add_short=0.12):
    """쉬는 곳을 늘림: 항목 사이처럼 길게 쉰 곳(0.65초 이상)은 0.45초 더, 줄 사이 짧은 쉼은 0.12초 더 → 뒤로 갈수록 급해지는 느낌을 줄임"""
    s = array("h", pcm[: len(pcm) // 2 * 2])
    fr = RATE // 50
    quiet = [max(abs(x) for x in s[i:i + fr:4]) < 900 for i in range(0, len(s) - fr, fr)]
    out, last, i = array("h"), 0, 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            d = (j - i) * 0.02
            if 0.2 <= d and j < len(quiet):
                mid = (i + j) // 2 * fr
                out += s[last:mid] + array("h", bytes(2 * int(RATE * (add_long if d >= long_gap else add_short))))
                last = mid
            i = j
        else:
            i += 1
    out += s[last:]
    return out.tobytes()


def similarity(pcm, text):
    """받아쓰기로 원고와 얼마나 같은지(0~1). 확인 못 하면 None"""
    try:
        d = post(CHECK_MODEL, {"contents": [{"parts": [
            {"inlineData": {"mimeType": "audio/mpeg", "data": base64.b64encode(to_mp3(pcm)).decode()}},
            {"text": "Transcribe this audio verbatim."}]}]}, timeout=300)
        heard = " ".join(p["audioTranscription"]["text"] for c in d["candidates"] for p in c["content"]["parts"] if "audioTranscription" in p)
    except (SystemExit, KeyError, IndexError):
        return None, ""
    norm = lambda x: re.sub(r"[\W\d_]", "", x.lower())
    return difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio(), heard


def make(page, lang, chunks):
    """조각마다 원고 일치(받아쓰기)와 목소리 높낮이(첫 조각 기준)를 확인. 다 만든 조각은 저장해 두고 다시 쓰지 않음"""
    import hashlib

    gap = bytes(2 * int(RATE * 0.55))
    work = WORK / page / lang
    work.mkdir(parents=True, exist_ok=True)
    pcm, ref = b"", None
    for i, text in enumerate(chunks):
        key = hashlib.sha1(f"{MODEL}|{VOICE}|{SEED}|v2|{text}".encode()).hexdigest()[:12]
        saved = work / f"{i + 1:02d}-{key}.pcm"
        if saved.exists():
            piece = saved.read_bytes()
            print(f"    조각 {i + 1}/{len(chunks)}: 저장해 둔 것 사용", flush=True)
        else:
            best = None
            whole = len(chunks) == 1
            for attempt in range(3):
                raw = work / f"{i + 1:02d}-{key}-try{attempt + 1}.raw"  # 받은 소리는 바로 저장(뒤에서 멈춰도 횟수 낭비 없게)
                if not raw.exists():
                    raw.write_bytes(synth(text, SEED + attempt))
                piece = trim(normalize(soften(raw.read_bytes())))
                score, heard = similarity(piece, text)
                f0 = pitch(piece)
                if whole:  # 한 번에 만든 녹음: 중간에 목소리가 바뀌는지(10초마다 음높이) 확인
                    diff = steadiness(piece)
                    ok_voice = diff <= 0.04
                else:  # 조각: 첫 조각과 비교
                    diff = abs(f0 / ref - 1) if (ref and f0) else 0
                    ok_voice = diff <= 0.10  # 음높이가 10% 넘게 다르면 다른 사람처럼 들림
                rank = (ok_voice, score or 0, -diff)
                if best is None or rank > best[0]:
                    best = (rank, piece, score, f0)
                if ok_voice and (score is None or score >= 0.95):
                    break
                why = [] if ok_voice else [f"목소리 높낮이 {diff:.0%} 다름"]
                if score is not None and score < 0.95:
                    why.append(f"원고와 {score:.0%} 일치")
                print(f"    조각 {i + 1}: {', '.join(why)} → 다시 만듦", flush=True)
            _, piece, score, f0 = best
            saved.write_bytes(piece)
            print(f"    조각 {i + 1}/{len(chunks)}: 원고 {'확인 못 함' if score is None else f'{score:.0%} 일치'}, 음높이 {f0 and round(f0)}Hz", flush=True)
        if ref is None:
            ref = pitch(piece)
        pcm += (gap if pcm else b"") + piece
    return pcm


def main():
    args = sys.argv[1:]
    pages = [a for a in args if a in CHUNKS] or list(CHUNKS)
    langs = [a for a in args if a in LANGS] or LANGS
    manifest = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {}
    for page in pages:
        for lang in langs:
            src = ROOT / "content" / ("gospel-text" if page == "gospel" else page) / f"{lang}.{'md' if page == 'gospel' else 'json'}"
            if not src.exists():
                continue
            print(f"{page} {lang} ({MODEL}, {VOICE})", flush=True)
            chunks = CHUNKS[page](lang)
            if "--whole" in args:  # 조각 이음새마다 목소리가 바뀌는 것을 피하려고 원고 전체를 한 번에
                chunks = ["\n\n".join(chunks)]
            pcm = make(page, lang, chunks)
            if page == "prayer777":  # 항목 사이를 조금 더 쉬게
                pcm = widen(pcm)
            mp3 = to_mp3(pcm)
            if "--draft" in args:
                dest = OUT / "drafts" / f"{page}-{lang}-gemini.mp3"
                dest.write_bytes(mp3)
                print(f"  → 시험본 {dest.relative_to(ROOT)}: 약 {len(pcm) / 2 / RATE / 60:.1f}분", flush=True)
                continue
            dest = OUT / page / f"{lang}.mp3"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(mp3)
            manifest.setdefault(page, [])
            if lang not in manifest[page]:
                manifest[page].append(lang)
            MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
            print(f"  → {dest.relative_to(ROOT)}: {len(mp3) / 1e6:.1f}MB, 약 {len(pcm) / 2 / RATE / 60:.1f}분", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
