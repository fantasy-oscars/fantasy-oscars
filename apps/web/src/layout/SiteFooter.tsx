import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <nav className="footer-links" aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/code-of-conduct">Code of Conduct</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
        <div className="footer-meta">
          <span>© {new Date().getFullYear()} Fantasy Oscars</span>
        </div>
      </div>
      <p className="footer-legal">
        Fantasy Oscars is a fan site and is not affiliated with the Academy of Motion
        Picture Arts and Sciences (AMPAS).
      </p>
    </footer>
  );
}
