import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.middleware.auth import get_current_user

router = APIRouter()

RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://localhost:8080")


class ChatRequest(BaseModel):
    question: str


# ── POST /knowledge/chat ───────────────────────────────────
@router.post("/chat")
async def chat(
    body: ChatRequest,
    current_user=Depends(get_current_user),
):
    """
    Proxy ke RAG service (/rag/chat). Frontend memanggil endpoint ini
    (bukan RAG langsung) supaya tetap satu origin + terlindung auth JWT,
    dan URL RAG tidak bocor ke browser.

    Response RAG: {"answer": str, "sources": [{...}]}.
    """
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                f"{RAG_SERVICE_URL}/rag/chat",
                json={"question": question},
            )
            res.raise_for_status()
            data = res.json()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Knowledge assistant is unavailable: {str(e)}",
        )

    return {
        "answer": data.get("answer", ""),
        "sources": data.get("sources", []),
    }
