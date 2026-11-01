import { BOOK_NAMES } from "./booknames.js";

// 사이트 전역 설정. 새 언어를 열 때는 LANGS의 ready를 true로 바꾸고
// content/i18n/<code>.json, content/gospel/<code>.json, bible/<code>/ 를 추가합니다.
export const LANGS = [
  { code: "ko", name: "한국어", dir: "ltr", ready: true },
  { code: "en", name: "English", dir: "ltr", ready: true },
  { code: "ur", name: "اردو", dir: "rtl", ready: true },
  { code: "zh", name: "中文", dir: "ltr", ready: true },
  { code: "ja", name: "日本語", dir: "ltr", ready: true },
  { code: "fr", name: "Français", dir: "ltr", ready: true },
  { code: "de", name: "Deutsch", dir: "ltr", ready: true },
  { code: "es", name: "Español", dir: "ltr", ready: true },
  { code: "ru", name: "Русский", dir: "ltr", ready: true },
];

// 성경 본문 (bible/<code>/<BOOK>.json). 모두 공개 또는 비상업 무료 배포 허용 번역본.
export const BIBLES = {
  ko: { name: "개역한글", license: "Public Domain" },
  en: { name: "Berean Standard Bible", license: "Public Domain" },
  ur: { name: "Urdu Geo Version", license: "© 2019 Urdu Geo Version, CC BY-NC-ND 4.0" },
  zh: { name: "和合本", license: "Public Domain" },
  ja: { name: "Japanese Freedom Bible", license: "Public Domain" },
  fr: { name: "Louis Segond 1910", license: "Public Domain" },
  de: { name: "Lutherbibel 1912", license: "Public Domain" },
  es: { name: "Reina-Valera 1909", license: "Public Domain" },
  ru: { name: "Синодальный перевод", license: "Public Domain" },
};

// [eBible 코드, 한국어, 한국어 약어, English, English 약어들, اردو]
const BOOK_ROWS = [
  ["GEN", "창세기", "창", "Genesis", "Gen", "پیدائش"],
  ["EXO", "출애굽기", "출", "Exodus", "Ex|Exo", "خروج"],
  ["LEV", "레위기", "레", "Leviticus", "Lev", "احبار"],
  ["NUM", "민수기", "민", "Numbers", "Num", "گنتی"],
  ["DEU", "신명기", "신", "Deuteronomy", "Deut", "استثنا"],
  ["JOS", "여호수아", "수", "Joshua", "Josh", "یشوع"],
  ["JDG", "사사기", "삿", "Judges", "Judg", "قضاۃ"],
  ["RUT", "룻기", "룻", "Ruth", "", "روت"],
  ["1SA", "사무엘상", "삼상", "1 Samuel", "1 Sam", "1۔سموئیل"],
  ["2SA", "사무엘하", "삼하", "2 Samuel", "2 Sam", "2۔سموئیل"],
  ["1KI", "열왕기상", "왕상", "1 Kings", "1 Kgs", "1۔سلاطین"],
  ["2KI", "열왕기하", "왕하", "2 Kings", "2 Kgs", "2۔سلاطین"],
  ["1CH", "역대상", "대상", "1 Chronicles", "1 Chr", "1۔تواریخ"],
  ["2CH", "역대하", "대하", "2 Chronicles", "2 Chr", "2۔تواریخ"],
  ["EZR", "에스라", "스", "Ezra", "", "عزرا"],
  ["NEH", "느헤미야", "느", "Nehemiah", "Neh", "نحمیاہ"],
  ["EST", "에스더", "에", "Esther", "Esth", "آستر"],
  ["JOB", "욥기", "욥", "Job", "", "ایوب"],
  ["PSA", "시편", "시", "Psalms", "Psalm|Ps", "زبور"],
  ["PRO", "잠언", "잠", "Proverbs", "Prov", "امثال"],
  ["ECC", "전도서", "전", "Ecclesiastes", "Eccl", "واعظ"],
  ["SOL", "아가", "아", "Song of Songs", "Song", "غزل الغزلات"],
  ["ISA", "이사야", "사", "Isaiah", "Isa", "یسعیاہ"],
  ["JER", "예레미야", "렘", "Jeremiah", "Jer", "یرمیاہ"],
  ["LAM", "예레미야애가", "애", "Lamentations", "Lam", "نوحہ"],
  ["EZE", "에스겔", "겔", "Ezekiel", "Ezek", "حزقی ایل"],
  ["DAN", "다니엘", "단", "Daniel", "Dan", "دانی ایل"],
  ["HOS", "호세아", "호", "Hosea", "Hos", "ہوسیع"],
  ["JOE", "요엘", "욜", "Joel", "", "یوایل"],
  ["AMO", "아모스", "암", "Amos", "", "عاموس"],
  ["OBA", "오바댜", "옵", "Obadiah", "Obad", "عبدیاہ"],
  ["JON", "요나", "욘", "Jonah", "", "یوناہ"],
  ["MIC", "미가", "미", "Micah", "Mic", "میکاہ"],
  ["NAH", "나훔", "나", "Nahum", "Nah", "ناحوم"],
  ["HAB", "하박국", "합", "Habakkuk", "Hab", "حبقوق"],
  ["ZEP", "스바냐", "습", "Zephaniah", "Zeph", "صفنیاہ"],
  ["HAG", "학개", "학", "Haggai", "Hag", "حجی"],
  ["ZEC", "스가랴", "슥", "Zechariah", "Zech", "زکریاہ"],
  ["MAL", "말라기", "말", "Malachi", "Mal", "ملاکی"],
  ["MAT", "마태복음", "마", "Matthew", "Matt|Mt", "متی"],
  ["MAR", "마가복음", "막", "Mark", "Mk", "مرقس"],
  ["LUK", "누가복음", "눅", "Luke", "Lk", "لوقا"],
  ["JOH", "요한복음", "요", "John", "Jn", "یوحنا"],
  ["ACT", "사도행전", "행", "Acts", "", "اعمال"],
  ["ROM", "로마서", "롬", "Romans", "Rom", "رومیوں"],
  ["1CO", "고린도전서", "고전", "1 Corinthians", "1 Cor", "1۔کرنتھیوں"],
  ["2CO", "고린도후서", "고후", "2 Corinthians", "2 Cor", "2۔کرنتھیوں"],
  ["GAL", "갈라디아서", "갈", "Galatians", "Gal", "گلتیوں"],
  ["EPH", "에베소서", "엡", "Ephesians", "Eph", "افسیوں"],
  ["PHI", "빌립보서", "빌", "Philippians", "Phil", "فلپیوں"],
  ["COL", "골로새서", "골", "Colossians", "Col", "کلسیوں"],
  ["1TH", "데살로니가전서", "살전", "1 Thessalonians", "1 Thess", "1۔تھسلنیکیوں"],
  ["2TH", "데살로니가후서", "살후", "2 Thessalonians", "2 Thess", "2۔تھسلنیکیوں"],
  ["1TI", "디모데전서", "딤전", "1 Timothy", "1 Tim", "1۔تیمتھیس"],
  ["2TI", "디모데후서", "딤후", "2 Timothy", "2 Tim", "2۔تیمتھیس"],
  ["TIT", "디도서", "딛", "Titus", "Tit", "ططس"],
  ["PHM", "빌레몬서", "몬", "Philemon", "Phlm", "فلیمون"],
  ["HEB", "히브리서", "히", "Hebrews", "Heb", "عبرانیوں"],
  ["JAM", "야고보서", "약", "James", "Jas", "یعقوب"],
  ["1PE", "베드로전서", "벧전", "1 Peter", "1 Pet", "1۔پطرس"],
  ["2PE", "베드로후서", "벧후", "2 Peter", "2 Pet", "2۔پطرس"],
  ["1JO", "요한일서", "요일", "1 John", "1 Jn", "1۔یوحنا"],
  ["2JO", "요한이서", "요이", "2 John", "2 Jn", "2۔یوحنا"],
  ["3JO", "요한삼서", "요삼", "3 John", "3 Jn", "3۔یوحنا"],
  ["JUD", "유다서", "유", "Jude", "", "یہوداہ"],
  ["REV", "요한계시록", "계", "Revelation", "Rev", "مکاشفہ"],
];

export const BOOKS = Object.fromEntries(
  BOOK_ROWS.map(([id, ko, koAbbr, en, enAbbr, ur]) => [
    id,
    {
      id, ko, koAbbr, en, enAbbr: enAbbr ? enAbbr.split("|") : [], ur,
      ...Object.fromEntries(Object.entries(BOOK_NAMES).map(([l, names]) => [l, names[id]])),
    },
  ]),
);

// 본문에서 자동으로 성구를 찾기 위한 이름 → 코드 맵 (긴 이름 우선)
export const BOOK_ALIASES = (() => {
  const map = new Map();
  for (const b of Object.values(BOOKS)) {
    for (const name of [b.ko, b.koAbbr, b.en, ...b.enAbbr]) map.set(name, b.id);
  }
  return map;
})();
