"""eBible.org VPL(verse-per-line) 파일을 책별 JSON으로 변환합니다.

사용법:
  python scripts/build_bible.py <vpl.txt 경로> <언어코드>
예:
  python scripts/build_bible.py C:/tmp/kor/kor_vpl.txt ko

결과: bible/<언어코드>/<BOOK>.json  ->  {"3": {"16": "..."}}
새 언어를 추가할 때는 eBible.org에서 <id>_vpl.zip 을 받아 이 스크립트를 실행하고
assets/config.js 의 BIBLES 항목에 버전 이름/저작권 표기를 추가하면 됩니다.
"""
import json
import os
import re
import sys

LINE = re.compile(r"^([0-9A-Z]{3})\s+(\d+):(\d+)\s?(.*)$")


def main(src, lang):
    root = os.path.join(os.path.dirname(__file__), "..", "bible", lang)
    os.makedirs(root, exist_ok=True)
    books = {}
    with open(src, encoding="utf-8-sig") as f:
        for raw in f:
            line = raw.replace("\u200f", "").replace("\u200e", "").strip()
            m = LINE.match(line)
            if not m:
                continue
            book, ch, vs, text = m.groups()
            text = text.strip()
            if lang == "ko":
                # 개역한글 원본의 ` 따옴표와 "길이요 !" 같은 공백 정리
                text = text.replace("`", "‘")
                text = re.sub(r"\s+([!?.,])", r"\1", text)
            if not text:
                continue
            books.setdefault(book, {}).setdefault(ch, {})[vs] = text
    for book, chapters in books.items():
        with open(os.path.join(root, f"{book}.json"), "w", encoding="utf-8") as out:
            json.dump(chapters, out, ensure_ascii=False, separators=(",", ":"))
    print(f"{lang}: {len(books)} books written to {os.path.abspath(root)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
