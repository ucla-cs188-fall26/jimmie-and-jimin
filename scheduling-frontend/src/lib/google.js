const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Loads Google's Identity Services script once and resolves with window.google.
export function loadGoogleScript() {
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
