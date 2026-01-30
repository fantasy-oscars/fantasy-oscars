import { StaticPage } from "../ui/StaticPage";

export function FeedbackPage() {
  return (
    <StaticPage title="Feedback">
      <p>
        We&apos;re dogfooding actively. If something feels off, tell us what you expected
        to happen and what actually happened.
      </p>
      <p>
        Email:{" "}
        <a href="mailto:feedback@fantasy-oscars.com">feedback@fantasy-oscars.com</a>
      </p>
    </StaticPage>
  );
}
