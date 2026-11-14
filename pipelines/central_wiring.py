from __future__ import annotations
from pathlib import Path
from agents.central.handlers import build_handlers
from agents.central.router import Router
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.central_pipeline import CentralPipeline
from pipelines.dev_pipeline import DevPipeline
from pipelines.finance_pipeline import FinancePipeline
from pipelines.funnel_pipeline import FunnelPipeline
from pipelines.music_pipeline import MusicPipeline
from pipelines.research_pipeline import ResearchPipeline
from pipelines.sales_pipeline import SalesPipeline


def build_central(*, router_llm, area_llm, db, data_dir, allowed_domains, allowed_imports, fetcher,
                  portfolio_provider=None, logger=None, market=None) -> CentralPipeline:
    data_dir = Path(data_dir)
    memory, perms, monitor = Memory(db), Permissions(db), ToolMonitor()
    logger = logger or JsonlLogger(data_dir / "logs" / "central.jsonl")
    handlers = build_handlers(
        finance=FinancePipeline(area_llm, memory, perms, logger, monitor, data_dir / "notes", market=market),
        music=MusicPipeline(area_llm, memory, perms, logger, monitor),
        sales=SalesPipeline(area_llm, memory, perms, logger, monitor),
        funnel=FunnelPipeline(area_llm, memory, perms, logger, monitor),
        research=ResearchPipeline(area_llm, fetcher, allowed_domains, memory, perms, logger, monitor),
        dev=DevPipeline(area_llm, allowed_imports, data_dir / "dev_output", memory, perms, logger, monitor),
        portfolio_provider=portfolio_provider,
    )
    return CentralPipeline(Router(router_llm, logger), handlers, memory, logger)

