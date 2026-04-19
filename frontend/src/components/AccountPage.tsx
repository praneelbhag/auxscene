import { useEffect, useState } from "react";

interface User { id: string; email: string; name: string; }

interface HistoryEntry {
  id: string;
  prompt: string;
  audio_url: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface AccountPageProps {
  user: User;
  token: string;
  onSignOut: () => void;
  onBack: () => void;
}

const API = "http://localhost:8000/api";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AccountPage({ user, token, onSignOut, onBack }: AccountPageProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/user/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleDelete = async (id: string) => {
    await fetch(`${API}/user/history/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setHistory((h) => h.filter((e) => e.id !== id));
  };

  const handleDownload = async (entry: HistoryEntry) => {
    if (!entry.audio_url) return;
    setDownloading(entry.id);
    try {
      const res = await fetch(entry.audio_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = entry.prompt.slice(0, 40).replace(/[^a-z0-9 ]/gi, "").replace(/\s+/g, "_").toLowerCase();
      a.download = `${safeName || "soundscene"}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setDownloading(null);
    }
  };

  return (
    <section className="account-page">
      <div className="account-header">
        <div className="account-header-left">
          <button className="account-back" onClick={onBack} type="button">← Back</button>
          <div>
            <p className="eyebrow">My Account</p>
            <h1 className="account-name">{user.name}</h1>
            <p className="account-email">{user.email}</p>
          </div>
        </div>
        <button className="account-signout" onClick={onSignOut} type="button">
          Sign Out
        </button>
      </div>

      <div className="account-section">
        <h2 className="account-section-title">Generated Scenes</h2>

        {loading && (
          <div className="account-empty">Loading your history…</div>
        )}

        {!loading && history.length === 0 && (
          <div className="account-empty">
            <p>No scenes yet.</p>
            <p>Generate your first spatial audio scene to see it here.</p>
            <button className="primary-action" onClick={onBack} type="button" style={{ marginTop: 16 }}>
              Create a Scene
            </button>
          </div>
        )}

        {!loading && history.length > 0 && (
          <div className="history-grid">
            {history.map((entry) => (
              <div key={entry.id} className="history-card">
                {entry.image_url ? (
                  <div className="history-thumb">
                    <img src={entry.image_url} alt="" />
                  </div>
                ) : (
                  <div className="history-thumb history-thumb-empty">
                    <span>♪</span>
                  </div>
                )}

                <div className="history-card-body">
                  <p className="history-prompt">{entry.prompt}</p>
                  <p className="history-meta">
                    {entry.duration_seconds != null ? `${entry.duration_seconds}s · ` : ""}
                    {formatDate(entry.created_at)}
                  </p>

                  {entry.audio_url && (
                    <audio className="history-player" controls src={entry.audio_url} />
                  )}

                  <div className="history-actions">
                    {entry.audio_url && (
                      <button
                        className="history-download"
                        type="button"
                        disabled={downloading === entry.id}
                        onClick={() => handleDownload(entry)}
                      >
                        {downloading === entry.id ? "Downloading…" : "↓ Download"}
                      </button>
                    )}
                    <button
                      className="history-delete"
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
