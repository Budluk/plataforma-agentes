"""Fabrica de ferramentas do StudioAgent a partir do registro unico.

Os nomes, parametros e metodos do cliente nao sao repetidos aqui: vem de
``core.tool_registry.TOOL_SPECS``. Os callables gerados preservam assinaturas
explicitas e inspecionaveis, equivalentes as funcoes escritas a mao antes da
unificacao.
"""
from __future__ import annotations

import inspect

from core.tool_registry import TOOL_SPECS, ToolSpec


def _make_call(client, name: str, spec: ToolSpec):
    """Cria um callable com a assinatura descrita no registro."""
    method = getattr(client, spec.client_method)
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

    def call(*args, **kwargs):
        bound = signature.bind(*args, **kwargs)
        values = [bound.arguments[field] for field in spec.required]
        # Passa None explicitamente quando o opcional foi omitido, como faziam
        # as closures originais (client.import_site(url, prompt)).
        values += [bound.arguments.get(field) for field in spec.optional]
        return method(*values)

    call.__name__ = name
    call.__qualname__ = name
    call.__signature__ = signature
    call.__annotations__ = {
        **{field: int if field in spec.integers else str for field in spec.required},
        **{field: str | None for field in spec.optional},
        "return": dict,
    }
    call.__doc__ = spec.description
    return call


def build_studio_tools(client) -> dict:
    """Monta as ferramentas do StudioAgent a partir do registro unico."""
    return {
        name: _make_call(client, name, spec)
        for name, spec in TOOL_SPECS.items()
        if spec.client_method
    }
