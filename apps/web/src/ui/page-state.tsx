export function PageLoader(props: { label?: string }) {
  return (
    <div className="page-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {props.label ?? "Loading..."}
    </div>
  );
}

export function PageError(props: { message: string }) {
  return (
    <div className="page-state status status-error" role="alert">
      {props.message}
    </div>
  );
}
