import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { PageLoader } from "../../../ui/page-state";
import { useCeremonyOptions } from "../../../features/admin/useCeremonyOptions";

export function AdminCeremoniesLayout() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const { state, error, options } = useCeremonyOptions();
  const navigate = useNavigate();

  const hasOptions = options.length > 0;
  const selected = useMemo(() => {
    if (!ceremonyIdRaw) return null;
    if (!Number.isFinite(ceremonyId)) return null;
    return options.find((o) => o.id === ceremonyId) ?? null;
  }, [options, ceremonyId, ceremonyIdRaw]);

  useEffect(() => {
    if (state !== "ready") return;
    if (!hasOptions) return;
    if (ceremonyIdRaw && !selected) {
      navigate("/admin/ceremonies", { replace: true });
    }
  }, [ceremonyIdRaw, hasOptions, navigate, selected, state]);

  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  if (state === "loading") return <PageLoader label="Loading ceremonies..." />;
  if (state === "error")
    return (
      <div className="status status-error">{error ?? "Unable to load ceremonies"}</div>
    );

  if (!hasOptions) return <PageLoader label="No ceremonies yet..." />;
  if (!ceremonyIdRaw || !selected) return <PageLoader label="Loading ceremony..." />;

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
              onChange={(e) => navigate(`/admin/ceremonies/${e.target.value}/overview`)}
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

      <Outlet />
    </section>
  );
}
