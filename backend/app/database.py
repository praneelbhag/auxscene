import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "soundscene.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audio_history (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                prompt TEXT NOT NULL,
                audio_url TEXT,
                image_url TEXT,
                duration_seconds REAL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(audio_history)").fetchall()
        }
        if "decompose_json" not in columns:
            conn.execute("ALTER TABLE audio_history ADD COLUMN decompose_json TEXT")
        if "generate_json" not in columns:
            conn.execute("ALTER TABLE audio_history ADD COLUMN generate_json TEXT")
        conn.commit()
