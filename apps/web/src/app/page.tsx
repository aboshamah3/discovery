import { APP_NAME } from "@ds/shared";

export default function Home() {
  // Falls back to the shared constant if the env var is absent,
  // so the app still boots without a configured .env.
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? APP_NAME;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.5 }}>
      <h1>{name}</h1>
      <p>Foundation skeleton is running. No product UI yet — that arrives in Spec 007.</p>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
