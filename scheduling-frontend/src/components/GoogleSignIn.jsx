import { useEffect, useRef, useState } from 'react';

import { loadGoogleScript } from '../lib/google.js';
import { api } from '../services/api.js';

export default function GoogleSignIn({ onSignedIn }) {  const buttonRef = useRef(null);
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function setup() {
      try {
        const [{ googleClientId }, google] = await Promise.all([
          api.getAuthConfig(),
          loadGoogleScript(),
        ]);

        if (ignore) return;

        if (!googleClientId) {
          throw new Error(
            'Google sign-in is not set up yet. Add GOOGLE_CLIENT_ID to backend/.env.'
          );
        }

        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            setBusy(true);
            setError('');

            try {
              const result = await api.googleLogin(credential);
              onSignedInRef.current(result);
            } catch (err) {
              setError(err.message);
              setBusy(false);
            }
          },
        });

        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 280,
        });

        setReady(true);
      } catch (err) {
        if (!ignore) setError(err.message);
      }
    }

    setup();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="google-signin">
      {error && (
        <p className="error" role="alert">{error}</p>
      )}

      {!ready && !error && <p role="status">Loading Google sign-in…</p>}
      {busy && <p role="status">Signing you in…</p>}

      <div ref={buttonRef} className="google-button" />
    </div>
  );
}
