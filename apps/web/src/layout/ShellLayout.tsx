import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { PageError } from "../ui/page-state";

export function ShellLayout() {
  const { user, loading, error, logout, refresh } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!userMenuOpen) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!userMenuOpen) return;
      if (e.key === "Escape") setUserMenuOpen(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  return (
    <div className="page">
      <div className="page-inner">
        <header className="site-header">
          <Link to="/" className="brand">
            <p className="eyebrow">Fantasy Oscars</p>
            <h1 className="site-title">Fantasy Oscars</h1>
          </Link>
        </header>

        {error && <PageError message={`Auth error: ${error}`} />}

        <nav className="site-nav" aria-label="Primary">
          <div className="nav-links">
            <NavLink
              className={({ isActive }) =>
                isActive || location.pathname === "/" || location.pathname === ""
                  ? "nav-link active"
                  : "nav-link"
              }
              to="/"
            >
              Home
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              to="/about"
            >
              About
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive || location.pathname.startsWith("/leagues")
                  ? "nav-link active"
                  : "nav-link"
              }
              to="/leagues"
            >
              Leagues
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              to="/seasons"
            >
              Seasons
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              to="/ceremonies"
            >
              Ceremonies
            </NavLink>
            {user?.is_admin && (
              <div className="nav-admin">
                <span className="nav-section">Admin</span>
                <NavLink
                  className={({ isActive }) =>
                    isActive ? "nav-link active" : "nav-link"
                  }
                  to="/admin"
                >
                  Console
                </NavLink>
              </div>
            )}
          </div>

          <div className="nav-actions">
            {loading ? (
              <span className="nav-muted">Loading…</span>
            ) : user ? (
              <div className="menu" ref={menuRef}>
                <button
                  type="button"
                  className="nav-user menu-button"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((v) => !v)}
                >
                  {user.username ?? user.sub}
                  <span className="caret" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="menu-panel" role="menu">
                    <button
                      type="button"
                      className="menu-item"
                      role="menuitem"
                      onClick={() => void refresh()}
                    >
                      Refresh session
                    </button>
                    <button
                      type="button"
                      className="menu-item"
                      role="menuitem"
                      onClick={() => navigate("/account")}
                    >
                      Account
                    </button>
                    <div className="menu-sep" role="separator" />
                    <button
                      type="button"
                      className="menu-item danger"
                      role="menuitem"
                      onClick={() => void logout()}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                state={{
                  from: `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`
                }}
                className="button ghost"
              >
                Login
              </Link>
            )}
          </div>
        </nav>

        <main className="site-content">
          <Outlet />
        </main>

        <footer className="site-footer">
          <nav className="footer-links" aria-label="Footer">
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
          <div className="footer-meta">
            <span>Fantasy Oscars</span>
            <span className="dot" aria-hidden="true">
              •
            </span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

