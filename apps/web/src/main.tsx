import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HealthSchema, type Health } from '@party/contracts';
import './style.css';

function App() {
  const [health, setHealth] = useState<Health>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    void fetch('/api/health/ready', { signal: controller.signal })
      .then(async response => {
        if (response.status !== 200 && response.status !== 503) throw new Error('Unexpected response');
        setHealth(HealthSchema.parse(await response.json()));
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);
  return <main>
    <p className="eyebrow">PARTY GAME BUILDER</p>
    <h1>The foundation comes first.</h1>
    <p>Browser frontend, authoritative backend, and shared validated contracts.</p>
    <section aria-labelledby="status"><h2 id="status">Development status</h2>
      <p role="status">{health ? `Server connected · ${health.version}` : failed ? 'Server unavailable. Start the backend, then refresh.' : 'Checking backend…'}</p>
      {health && <p>Creator authentication: {health.checks.authentication.replaceAll('_', ' ')}.</p>}
      {health && <p>Database: {health.checks.database.replaceAll('_', ' ')}.</p>}
      <p>Database schema and migrations are available. Gameplay, editor screens, and live sign-in are not implemented yet.</p>
    </section>
  </main>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
