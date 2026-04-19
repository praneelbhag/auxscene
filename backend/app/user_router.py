import json
import uuid
from typing import Any
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .auth_utils import create_token, hash_password, verify_password, verify_token
from .database import get_conn

router = APIRouter(prefix="/api")


# ── helpers ──────────────────────────────────────────────────────────────────

def _require_user(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    user_id = verify_token(authorization[7:])
    if not user_id:
        raise HTTPException(401, "Invalid or expired token")
    return user_id


# ── schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class HistorySaveRequest(BaseModel):
    prompt: str
    audio_url: str | None = None
    image_url: str | None = None
    duration_seconds: float | None = None
    decompose_data: dict[str, Any] | None = None
    generate_data: dict[str, Any] | None = None


class HistoryUpdateRequest(BaseModel):
    prompt: str | None = None
    audio_url: str | None = None
    image_url: str | None = None
    duration_seconds: float | None = None
    decompose_data: dict[str, Any] | None = None
    generate_data: dict[str, Any] | None = None


# ── routes ───────────────────────────────────────────────────────────────────

@router.post("/auth/register")
def register(req: RegisterRequest):
    password_hash, salt = hash_password(req.password)
    user_id = uuid.uuid4().hex
    email = req.email.lower().strip()
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, email, name, password_hash, salt, created_at) VALUES (?,?,?,?,?,?)",
                (user_id, email, req.name.strip(), password_hash, salt,
                 datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()
    except Exception:
        raise HTTPException(409, "An account with that email already exists.")
    return {"token": create_token(user_id), "user": {"id": user_id, "email": email, "name": req.name.strip()}}


@router.post("/auth/login")
def login(req: LoginRequest):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?",
                           (req.email.lower().strip(),)).fetchone()
    if not row or not verify_password(req.password, row["password_hash"], row["salt"]):
        raise HTTPException(401, "Invalid email or password.")
    return {"token": create_token(row["id"]), "user": {"id": row["id"], "email": row["email"], "name": row["name"]}}


@router.get("/user/me")
def me(authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    with get_conn() as conn:
        row = conn.execute("SELECT id, email, name, created_at FROM users WHERE id = ?",
                           (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)


@router.get("/user/history")
def get_history(authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, prompt, audio_url, image_url, duration_seconds, created_at, "
            "decompose_json, generate_json "
            "FROM audio_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            (user_id,),
        ).fetchall()

    history = []
    for row in rows:
        entry = dict(row)
        decompose_json = entry.pop("decompose_json", None)
        generate_json = entry.pop("generate_json", None)
        entry["decompose_data"] = json.loads(decompose_json) if decompose_json else None
        entry["generate_data"] = json.loads(generate_json) if generate_json else None
        history.append(entry)
    return history


@router.post("/user/history")
def save_history(req: HistorySaveRequest, authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    entry_id = uuid.uuid4().hex
    decompose_json = json.dumps(req.decompose_data) if req.decompose_data else None
    generate_json = json.dumps(req.generate_data) if req.generate_data else None
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO audio_history "
            "(id, user_id, prompt, audio_url, image_url, duration_seconds, created_at, decompose_json, generate_json) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (entry_id, user_id, req.prompt, req.audio_url, req.image_url,
             req.duration_seconds, datetime.now(timezone.utc).isoformat(),
             decompose_json, generate_json),
        )
        conn.commit()
    return {"id": entry_id}


@router.patch("/user/history/{entry_id}")
def update_history_entry(
    entry_id: str,
    req: HistoryUpdateRequest,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(authorization)
    updates: list[str] = []
    values: list[Any] = []

    for field in ("prompt", "audio_url", "image_url", "duration_seconds"):
        value = getattr(req, field)
        if value is not None:
            updates.append(f"{field} = ?")
            values.append(value)

    if req.decompose_data is not None:
        updates.append("decompose_json = ?")
        values.append(json.dumps(req.decompose_data))
    if req.generate_data is not None:
        updates.append("generate_json = ?")
        values.append(json.dumps(req.generate_data))

    if not updates:
        return {"ok": True}

    values.extend([entry_id, user_id])
    with get_conn() as conn:
        result = conn.execute(
            f"UPDATE audio_history SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
            values,
        )
        conn.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "History entry not found")
    return {"ok": True}


@router.delete("/user/history/{entry_id}")
def delete_history_entry(entry_id: str, authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    with get_conn() as conn:
        conn.execute("DELETE FROM audio_history WHERE id = ? AND user_id = ?", (entry_id, user_id))
        conn.commit()
    return {"ok": True}
