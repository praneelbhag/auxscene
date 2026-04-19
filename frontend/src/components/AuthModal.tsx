import { FormEvent, useState } from "react";

interface User { id: string; email: string; name: string; }

interface AuthModalProps {
  onSuccess: (user: User, token: string) => void;
  onClose: () => void;
}

const API = "http://localhost:8000/api";

export function AuthModal({ onSuccess, onClose }: AuthModalProps) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = tab === "signin" ? "/auth/login" : "/auth/register";
    const body = tab === "signin"
      ? { email, password }
      : { email, name, password };

    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Something went wrong.");
      onSuccess(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} type="button" aria-label="Close">×</button>

        <div className="auth-logo">
          <span className="eyebrow">aux.scene</span>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === "signin" ? " active" : ""}`}
            onClick={() => { setTab("signin"); setError(null); }}
            type="button"
          >Sign In</button>
          <button
            className={`auth-tab${tab === "signup" ? " active" : ""}`}
            onClick={() => { setTab("signup"); setError(null); }}
            type="button"
          >Create Account</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {tab === "signup" && (
            <label className="auth-field">
              <span>Name</span>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          )}
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              placeholder={tab === "signup" ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={tab === "signup" ? 8 : 1}
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Please wait…" : tab === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="auth-footer">
          {tab === "signin"
            ? <>No account? <button type="button" onClick={() => setTab("signup")}>Sign up free</button></>
            : <>Already have an account? <button type="button" onClick={() => setTab("signin")}>Sign in</button></>
          }
        </p>
      </div>
    </div>
  );
}
