import GoogleSignIn from './GoogleSignIn.jsx';

export default function LoginPage({ onSignedIn }) {
  return (
    <section className="panel login-page">
      <span className="eyebrow">WELCOME</span>
      <h1>Sign in to gather.</h1>
      <p>
        Sign in with Google to create events, join invites, and share your
        calendar availability.
      </p>

      <GoogleSignIn onSignedIn={onSignedIn} />

      <a className="text-link" href="#home">
        Back
      </a>
    </section>
  );
}
