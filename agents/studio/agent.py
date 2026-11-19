"""StudioAgent com metodos gerados a partir do registro unico.

Os nomes das 17 ferramentas, as assinaturas e a regra de permissao/sequencia
nao sao repetidos aqui: vem de ``core.tool_registry``. O agente expoe os
metodos de dominio (``list_apps``, ``import_site``, ...) e cada um resolve a
ferramenta correspondente atraves de ``STUDIO_AGENT_TOOL``.
"""
from __future__ import annotations

import inspect

from agents.base_agent import BaseAgent
from core.tool_registry import STUDIO_AGENT_TOOL, TOOL_SPECS, ToolSpec

_STUDIO_AGENT_SPECS: dict[str, ToolSpec] = {
    method: TOOL_SPECS[tool] for method, tool in STUDIO_AGENT_TOOL.items()
}


def _make_agent_method(method: str, spec: ToolSpec):
    """Cria um metodo publico com a assinatura descrita no registro."""
    params = [
        inspect.Parameter(
            field,
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            annotation=int if field in spec.integers else str,
        )
        for field in spec.required
    ]
    params += [
        inspect.Parameter(
            field,
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            default=None,
            annotation=str | None,
        )
        for field in spec.optional
    ]
    signature = inspect.Signature(params, return_annotation=dict)

    def call(self, *args, **kwargs):
        bound = signature.bind(*args, **kwargs)
        return self.call_tool(STUDIO_AGENT_TOOL[method], **bound.arguments)

    call.__name__ = method
    call.__qualname__ = f"StudioAgent.{method}"
    call.__signature__ = signature
    call.__annotations__ = {
        **{field: int if field in spec.integers else str for field in spec.required},
        **{field: str | None for field in spec.optional},
        "return": dict,
    }
    call.__doc__ = spec.description
    return call


class StudioAgent(BaseAgent):
    """Agente independente da área studio. Sem LLM: só ferramentas supervisionadas."""

    name = "studio_agent"


for _method, _spec in _STUDIO_AGENT_SPECS.items():
    setattr(StudioAgent, _method, _make_agent_method(_method, _spec))
del _method, _spec
