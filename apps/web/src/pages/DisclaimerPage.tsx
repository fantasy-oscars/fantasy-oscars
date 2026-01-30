import { StaticPage } from "../ui/StaticPage";

export function DisclaimerPage() {
  return (
    <StaticPage title="Disclaimer">
      <p>
        Fantasy Oscars is a fan-run site and is not affiliated with the Academy of Motion
        Picture Arts and Sciences (AMPAS).
      </p>
      <p className="muted">
        Movie metadata and images are provided by third parties (for example, TMDB) and
        are used to support the fantasy game experience.
      </p>
    </StaticPage>
  );
}
