import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core import approvals_admin as adm
from core.control_store import ControlStore


def _human() -> str:
    return os.environ.get("USERNAME") or os.environ.get("USER") or "humano"


def _confirm(prompt: str) -> bool:
    """Ações que liberam algo exigem uma pessoa num terminal interativo; entrada redirecionada é recusada."""
    if not sys.stdin.isatty():
        print("Recusado: esta ação exige um terminal interativo (uma pessoa digitando).")
        return False
    return input(prompt + " Digite SIM para confirmar: ").strip() == "SIM"


def main(argv=None, store: ControlStore | None = None) -> int:
    out = getattr(sys.stdout, "reconfigure", None)
    if out:
        out(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Aprovações humanas, kill switch e auditoria.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="pedidos pendentes")
    p = sub.add_parser("show"); p.add_argument("id", type=int)
    p = sub.add_parser("approve"); p.add_argument("id", type=int)
    p = sub.add_parser("deny"); p.add_argument("id", type=int)
    k = sub.add_parser("kill", help="kill switch"); k.add_argument("op", choices=["status", "engage", "release"])
    k.add_argument("reason", nargs="?", default="acionado manualmente")
    a = sub.add_parser("audit"); a.add_argument("--tail", type=int, default=20); a.add_argument("--verify", action="store_true")
    args = ap.parse_args(argv)

    if store is None:
        store = ControlStore(ROOT / "data" / "control.db")
        store.init()
    me = _human()

    if args.cmd == "list":
        items = adm.pending(store)
        print(json.dumps(items, ensure_ascii=False, indent=2) if items else "Nenhum pedido pendente.")
        return 0
    if args.cmd == "show":
        row = store.get_approval(args.id)
        if row is None:
            print("Pedido não encontrado.")
            return 1
        print(json.dumps(adm.describe(row), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "approve":
        row = store.get_approval(args.id)
        if row is None:
            print("Pedido não encontrado.")
            return 1
        print(json.dumps(adm.describe(row), ensure_ascii=False, indent=2))
        if not _confirm(f"Aprovar o pedido {args.id}?"):
            print("Nada foi aprovado.")
            return 1
        print("Resultado:", adm.decide(store, args.id, True, me))
        return 0
    if args.cmd == "deny":
        print("Resultado:", adm.decide(store, args.id, False, me))
        return 0
    if args.cmd == "kill":
        if args.op == "status":
            engaged, why = store.kill_state()
            print("KILL SWITCH ATIVO:" if engaged else "Kill switch desligado.", why)
            return 0
        if args.op == "engage":
            adm.engage_kill(store, args.reason, me)  # parar é sempre seguro: não exige terminal interativo
            print("Kill switch ACIONADO. Nenhuma ação sensível será proposta nem executada.")
            return 0
        if not _confirm("Liberar o kill switch?"):
            print("O kill switch continua ativo.")
            return 1
        adm.release_kill(store, me)
        print("Kill switch liberado.")
        return 0
    if args.cmd == "audit":
        ok, n, bad = store.verify_chain()
        print(f"cadeia de auditoria: {'ÍNTEGRA' if ok else 'ADULTERADA (primeiro evento ruim: %s)' % bad} | eventos: {n}")
        if not args.verify:
            for e in store.audit_tail(args.tail):
                print(json.dumps(e, ensure_ascii=False))
        return 0 if ok else 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
