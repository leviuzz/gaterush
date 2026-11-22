/** The address of the server alone: nothing of any airport, checkpoint or ticket. */
export function Home() {
  return (
    <div className="home">
      <main className="page-main">
        <section className="card message-card">
          <h1 className="brand-title">GateFlow</h1>
          <p className="message">Virtual queue for airport security checkpoints.</p>
          <p className="muted">
            {__WEB_VERSION__} ·{' '}
            <a href="/v1/openapi.json" className="link">
              API
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
