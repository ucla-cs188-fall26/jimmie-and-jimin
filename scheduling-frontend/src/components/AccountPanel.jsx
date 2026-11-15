import { useEffect, useState } from 'react';

async function authRequest(path, data) {
  const options = {
    credentials: 'same-origin',
  };

  if (data !== undefined) {
    const tokenResponse = await fetch('/api/csrf', {
      credentials: 'same-origin',
    });

    if (!tokenResponse.ok) {
      throw new Error('Could not get the security token. Is Django running?');
    }

    const { csrfToken } = await tokenResponse.json();

    options.method = 'POST';
    options.headers = {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken,
    };
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`/api/auth/${path}`, options);

  const result = await response.json().catch(() => {
    throw new Error('Unexpected server response. Check the Django terminal.');
  });

  if (!response.ok) {
    const messages = Object.values(result.errors || {})
      .flat()
      .map((error) => error.message);

    throw new Error(
      messages.join(' ') || result.error || 'Request failed.'
    );
  }

  return result;
}

export default function AccountPanel() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    authRequest('me')
      .then((result) => {
        if (!ignore) setUser(result.user);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = mode === 'signup'
        ? {
            username,
            password1: password,
            password2: confirmation,
          }
        : { username, password };

      const result = await authRequest(mode, data);
      setUser(result.user);
      setPassword('');
      setConfirmation('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');

    try {
      await authRequest('logout', {});
      setUser(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <h2>Your account</h2>

      {error && (
        <p className="error" role="alert">{error}</p>
      )}

      {loading ? (
        <p role="status">Checking your account…</p>
      ) : user ? (
        <div>
          <p>
            Signed in as <strong>{user.username}</strong>
          </p>
          <button onClick={signOut} disabled={busy}>
            {busy ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-pressed={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Log in
            </button>

            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-pressed={mode === 'signup'}
              onClick={() => {
                setMode('signup');
                setError('');
              }}
            >
              Create account
            </button>
          </div>

          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              maxLength={150}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              required
            />
          </label>

          {mode === 'signup' && (
            <label>
              Confirm password
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          )}

          <button type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Sign up'
                : 'Log in'}
          </button>
        </form>
      )}
    </section>
  );
}