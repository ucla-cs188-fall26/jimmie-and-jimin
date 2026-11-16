import { useEffect, useRef, useState } from 'react';

import { api } from '../services/api.js';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Loads Google's Identity Services script once and resolves with window.google.
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${GSI_SRC}"]`);

    if (!script) {
      script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener('load', () => resolve(window.google));
    script.addEventListener('error', () =>
      reject(new Error('Could not load Google sign-in. Check your connection.'))
    );
  });
}

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
