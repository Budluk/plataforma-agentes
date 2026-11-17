"""Área studio: cliente supervisionado do CloneStudio local.

O CloneStudio é um serviço Node separado, vendorizado em ``clonestudio/``.
A plataforma nunca importa nem executa o código JavaScript dele: conversa
apenas por HTTP em loopback, com gate, permissões, monitor e log.
"""
