from __future__ import annotations
import re
from pathlib import Path
from agents.dev.static_check import analyze_source

SAFE_NAME = re.compile(r"^[A-Za-z0-9_\-]{1,40}\.py$")
RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
HEADER = ("# GERADO POR LLM. NAO EXECUTADO PELA PLATAFORMA.\n"
          "# Leia e revise tudo antes de rodar, de preferencia em ambiente isolado.\n")


def build_dev_tools(holder: dict, allowed_imports, out_dir) -> dict:
    out_dir = Path(out_dir)

    def analyze_code() -> dict:
        report = analyze_source(holder["code"], allowed_imports)
        holder["approved"] = report.ok
        return {"approved": report.ok, "findings": report.findings,
                "warnings": report.warnings, "metrics": report.metrics}

    def save_code_file(filename: str) -> dict:
        if not holder.get("approved"):
            raise ValueError("código não aprovado pela análise estática; nada foi salvo")
        if not SAFE_NAME.match(filename) or filename[:-3].lower() in RESERVED:
            raise ValueError("nome de arquivo inválido")
        out_dir.mkdir(parents=True, exist_ok=True)
        stem, target, n = filename[:-3], out_dir / filename, 2
        while target.exists():
            target = out_dir / f"{stem}_{n}.py"
            n += 1
        target.write_text(HEADER + holder["code"].rstrip("\n") + "\n", encoding="utf-8")
        return {"filename": target.name, "path": str(target), "executed": False}

    return {"analyze_code": analyze_code, "save_code_file": save_code_file}
