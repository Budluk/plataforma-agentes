import sys

def main() -> int:
    erros = []
    if sys.version_info[:2] != (3, 12):
        erros.append(f"Python {sys.version.split()[0]} (esperado 3.12.x)")
    for mod in ("pydantic", "httpx", "dotenv", "pytest", "pytest_asyncio"):
        try:
            __import__(mod)
        except ImportError:
            erros.append(f"dependência ausente: {mod}")
    if erros:
        for e in erros:
            print("ERRO:", e)
        return 1
    print(f"Python {sys.version.split()[0]}")
    print("Ambiente ok.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
