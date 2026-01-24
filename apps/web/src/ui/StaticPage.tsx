export function StaticPage(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <header>
        <h2>{props.title}</h2>
      </header>
      <div className="prose">{props.children}</div>
    </section>
  );
}

