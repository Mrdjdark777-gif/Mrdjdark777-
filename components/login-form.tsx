'use client';
import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useT } from '@/components/i18n-provider';

export function LoginForm() {
  const { t } = useT();
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
      if (!r.ok) throw new Error(d.error ? t(d.error.replace(/^#/, '')) : t('login.failed'));
      location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src="/brand/logo.png?v=0.4.1" width="72" height="72" alt="True Thrills" />
        <h1>{t('login.title')}</h1>
        <label className="field">
          {t('login.password')}
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('login.passwordPlaceholder')}
          />
        </label>
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={busy || !password}>
          {busy ? <Loader2 className="spin" size={17} /> : <Lock size={17} />}
          {busy ? t('login.busy') : t('common.login')}
        </button>
      </form>
    </div>
  );
}
