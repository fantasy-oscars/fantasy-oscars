import { Link } from "react-router-dom";
import tmdbLogoUrl from "../assets/tmdb.svg";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="footer-grid" aria-label="Footer">
        <section className="footer-col" aria-label="Product">
          <h3 className="footer-col-title">Product</h3>
          <div className="footer-col-links">
            <Link to="/about">About</Link>
            <Link to="/how-it-works">How It Works</Link>
            <Link to="/faq">FAQ</Link>
          </div>
        </section>

        <section className="footer-col" aria-label="Community">
          <h3 className="footer-col-title">Community</h3>
          <div className="footer-col-links">
            <Link to="/contact">Contact</Link>
            <Link to="/feedback">Feedback</Link>
            <Link to="/code-of-conduct">Code of Conduct</Link>
          </div>
        </section>

        <section className="footer-col" aria-label="Legal">
          <h3 className="footer-col-title">Legal</h3>
          <div className="footer-col-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/disclaimer">Disclaimer</Link>
          </div>
        </section>

        <section className="footer-col" aria-label="With">
          <h3 className="footer-col-title">With</h3>
          <div className="footer-col-links">
            <a
              className="footer-logo-link"
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noreferrer"
              aria-label="The Movie Database (TMDB)"
            >
              <img className="footer-logo" src={tmdbLogoUrl} alt="TMDB" />
            </a>
          </div>
        </section>
      </nav>

      <div className="footer-fineprint">
        © 2026 Fantasy Oscars · Fan-run. Not affiliated with AMPAS.
      </div>
    </footer>
  );
}
