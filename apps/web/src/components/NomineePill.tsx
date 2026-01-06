type NomineeState = "default" | "active" | "picked" | "disabled";

export function NomineePill(props: {
  name: string;
  category?: string;
  state?: NomineeState;
}) {
  const { name, category, state = "default" } = props;
  return (
    <div className="nominee-pill" data-state={state} title={name} aria-label={name}>
      <span className="nominee-name">{name}</span>
      {category ? <span className="nominee-category">{category}</span> : null}
    </div>
  );
}
