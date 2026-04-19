import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone

_SECRET = os.environ.get("SECRET_KEY", "soundscene-dev-secret-2024")


def hash_password(password: str) -> tuple[str, str]:
    salt = base64.b64encode(os.urandom(16)).decode()
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return base64.b64encode(dk).decode(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return hmac.compare_digest(base64.b64encode(dk).decode(), stored_hash)


def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": (datetime.now(timezone.utc) + timedelta(days=30)).timestamp(),
    }
    payload_b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    sig = hmac.new(_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_token(token: str) -> str | None:
    try:
        payload_b64, sig = token.rsplit(".", 1)
        expected = hmac.new(_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(base64.b64decode(payload_b64))
        if payload["exp"] < datetime.now(timezone.utc).timestamp():
            return None
        return payload["user_id"]
    except Exception:
        return None
