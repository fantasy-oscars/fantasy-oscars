import { StaticPage } from "../ui/StaticPage";

export function PrivacyPage() {
  return (
    <StaticPage title="Privacy">
      <p>
        MVP policy: we store account and league data to run the game. We do not sell
        personal information.
      </p>
      <p>More detailed policies can be added before go-live.</p>
    </StaticPage>
  );
}

