'use client';
import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || 'Не удалось войти');
      location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src="/brand/logo.png?v=0.4.1" width="72" height="72" alt="True Thrills" />
        <h1>Вход в студию</h1>
        <label className="field">
          Пароль автора
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
          />
        </label>
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={busy || !password}>
          {busy ? <Loader2 className="spin" size={17} /> : <Lock size={17} />}
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
