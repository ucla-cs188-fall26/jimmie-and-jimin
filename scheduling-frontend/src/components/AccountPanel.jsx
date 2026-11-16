import { useEffect, useState } from 'react';

import GoogleSignIn from './GoogleSignIn.jsx';

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

export default function AccountPanel({ onUserChange }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (onUserChange) onUserChange(user);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
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
            Signed in as <strong>{user.displayName || user.username}</strong>
          </p>
          <button onClick={signOut} disabled={busy}>
            {busy ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      ) : (
        <div className="google-first">
          <p>Sign in with your Google account to get started.</p>

          <GoogleSignIn onSignedIn={(result) => setUser(result.user)} />
        </div>
      )}
    </section>
  );
}