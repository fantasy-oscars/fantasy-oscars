import { Link, NavLink } from "react-router-dom";
import type { CeremonyOption } from "../../../orchestration/adminCeremonies";

export function AdminCeremoniesLayoutScreen(props: {
  selected: CeremonyOption;
  options: CeremonyOption[];
  onSelectCeremony: (id: string) => void;
  children: React.ReactNode;
}) {
  const { selected, options, onSelectCeremony, children } = props;

  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Ceremonies</h2>
          <p className="muted">
            Selected: {selected.name || "(Unnamed)"}{" "}
            {selected.code ? `(${selected.code})` : ""}
          </p>
        </div>

        <div className="inline-actions">
          <Link to="/admin/ceremonies" className="button ghost">
            All ceremonies
          </Link>
          <label className="field">
            <span>Ceremony</span>
            <select
              value={String(selected.id)}
              onChange={(e) => onSelectCeremony(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || "(Unnamed)"} {o.code ? `(${o.code})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <nav className="admin-subnav" aria-label="Ceremony admin">
        <NavLink
          to={`/admin/ceremonies/${selected.id}/overview`}
          className={sublinkClass}
        >
          Overview
        </NavLink>
        <NavLink
          to={`/admin/ceremonies/${selected.id}/categories`}
          className={sublinkClass}
        >
          Categories
        </NavLink>
        <NavLink
          to={`/admin/ceremonies/${selected.id}/nominees`}
          className={sublinkClass}
        >
          Nominees
        </NavLink>
        <NavLink to={`/admin/ceremonies/${selected.id}/winners`} className={sublinkClass}>
          Winners
        </NavLink>
        <NavLink to={`/admin/ceremonies/${selected.id}/scoring`} className={sublinkClass}>
          Scoring
        </NavLink>
        <NavLink to={`/admin/ceremonies/${selected.id}/lock`} className={sublinkClass}>
          Lock / Archive
        </NavLink>
      </nav>

      {children}
    </section>
  );
}
