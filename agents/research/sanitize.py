from __future__ import annotations
import re
from html.parser import HTMLParser

MAX_CHARS = 6000
SKIP_TAGS = {"script", "style", "noscript", "template", "svg", "iframe", "object", "embed"}
BLOCK_TAGS = {"p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
              "section", "article", "ul", "ol", "table", "title"}
INJECTION_PATTERNS = (
    "ignore previous", "ignore all previous", "ignore as instruções", "ignore as regras",
    "desconsidere as instruções", "disregard", "system prompt", "you are now", "você agora é",
    "new instructions", "novas instruções", "run the following", "execute o comando",
)
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


class _Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip += 1
        elif tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            if self.skip > 0:
                self.skip -= 1
        elif tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    try:
        p = _Extractor()
        p.feed(html)
        p.close()
        return "".join(p.parts)
    except Exception:
        return ""


def clean_text(text: str, max_chars: int = MAX_CHARS) -> tuple[str, bool]:
    t = _CONTROL.sub("", text)
    while "<<<" in t or ">>>" in t:
        t = t.replace("<<<", "").replace(">>>", "")
    t = re.sub(r"[ \t]+", " ", t)
    t = "\n".join(ln for ln in (x.strip() for x in t.split("\n")) if ln)
    if len(t) > max_chars:
        return t[:max_chars], True
    return t, False


def find_injection(text: str) -> list[str]:
    low = text.lower()
    return [p for p in INJECTION_PATTERNS if p in low]
