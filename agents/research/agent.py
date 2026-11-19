from __future__ import annotations
from agents.base_agent import BaseAgent
from agents.research.fetcher import FetchError
from agents.research.sanitize import clean_text, find_injection, html_to_text
from core.tool_registry import AGENT_TOOL


def build_research_tools(fetcher) -> dict:
    def fetch_page(url: str) -> dict:
        try:
            page = fetcher.fetch(url)
        except FetchError as exc:
            raise ValueError(f"falha ao buscar página: {exc}") from None
        raw = html_to_text(page.text) if page.content_type == "text/html" else page.text
        text, cut = clean_text(raw)
        return {"url": page.url, "text": text, "truncated": bool(page.truncated or cut),
                "injection_flags": find_injection(text)}

    return {AGENT_TOOL[("research_agent", "fetch")]: fetch_page}


class ResearchAgent(BaseAgent):
    name = "research_agent"

    def fetch(self, url: str) -> dict:
        return self.call_tool(AGENT_TOOL[(self.name, "fetch")], url=url)
