import os
import sys
import httpx
from dotenv import load_dotenv

def main() -> int:
    load_dotenv()
    key = os.getenv("GROQ_API_KEY", "").strip()
    model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    if not key:
        print("ERRO: GROQ_API_KEY vazio ou ausente no .env")
        return 1
    try:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": "Responda apenas com a palavra OK."}],
                "max_tokens": 300,
                "temperature": 0,
            },
            timeout=30,
        )
    except httpx.HTTPError as e:
        print("ERRO de rede:", type(e).__name__)
        return 1
    if r.status_code != 200:
        print("ERRO HTTP", r.status_code, r.text[:300])
        return 1
    texto = r.json()["choices"][0]["message"]["content"] or ""
    print("Resposta:", texto)
    if "OK" not in texto.upper():
        print("ERRO: resposta não contém OK")
        return 1
    print("Teste LLM ok.")
    return 0

if __name__ == "__main__":
    sys.exit(main())

