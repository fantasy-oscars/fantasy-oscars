import { lazy, useEffect, useState, type ComponentType } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/context";
import { BrandProvider } from "@/brand/context";
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from "@/auth/guards";
import { ShellLayout } from "./layouts/ShellLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { DraftLayout } from "./layouts/DraftLayout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LazyRoute } from "./LazyRoute";
import { createQueryClient } from "@/orchestration/query/client";
import { registerWriteInvalidation } from "@/orchestration/query/invalidate";

// Pages export a named component; React.lazy wants a default export.
function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K
) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

// Route groups loaded on navigation: static content, leagues, seasons, ceremonies, invites, account.
const AboutPage = lazyPage(() => import("./pages/AboutPage"), "AboutPage");
const CodeOfConductPage = lazyPage(
  () => import("./pages/CodeOfConductPage"),
  "CodeOfConductPage"
);
const ContactPage = lazyPage(() => import("./pages/ContactPage"), "ContactPage");
const DisclaimerPage = lazyPage(() => import("./pages/DisclaimerPage"), "DisclaimerPage");
const FeedbackPage = lazyPage(() => import("./pages/FeedbackPage"), "FeedbackPage");
const FaqPage = lazyPage(() => import("./pages/FaqPage"), "FaqPage");
const HowItWorksPage = lazyPage(() => import("./pages/HowItWorksPage"), "HowItWorksPage");
const PrivacyPage = lazyPage(() => import("./pages/PrivacyPage"), "PrivacyPage");
const TermsPage = lazyPage(() => import("./pages/TermsPage"), "TermsPage");
const LeaguesPage = lazyPage(() => import("./pages/LeaguesPage"), "LeaguesPage");
const LeagueCreatePage = lazyPage(
  () => import("./pages/LeagueCreatePage"),
  "LeagueCreatePage"
);
const LeagueDetailPage = lazyPage(
  () => import("./pages/LeagueDetailPage"),
  "LeagueDetailPage"
);
const LeagueSeasonCreatePage = lazyPage(
  () => import("./pages/LeagueSeasonCreatePage"),
  "LeagueSeasonCreatePage"
);
const InviteClaimPage = lazyPage(
  () => import("./pages/InviteClaimPage"),
  "InviteClaimPage"
);
const InvitesInboxPage = lazyPage(
  () => import("./pages/InvitesInboxPage"),
  "InvitesInboxPage"
);
const AccountPage = lazyPage(() => import("./pages/AccountPage"), "AccountPage");
const CeremoniesPage = lazyPage(() => import("./pages/CeremoniesPage"), "CeremoniesPage");
const CeremonyPage = lazyPage(() => import("./pages/CeremonyPage"), "CeremonyPage");
const SeasonsIndexPage = lazyPage(
  () => import("./pages/SeasonsIndexPage"),
  "SeasonsIndexPage"
);
const SeasonPage = lazyPage(() => import("./pages/SeasonPage"), "SeasonPage");
const CircuitLeaguePage = lazyPage(
  () => import("./pages/CircuitLeaguePage"),
  "CircuitLeaguePage"
);
const CircuitRosterPage = lazyPage(
  () => import("./pages/CircuitRosterPage"),
  "CircuitRosterPage"
);
const CircuitTransactionsPage = lazyPage(
  () => import("./pages/CircuitTransactionsPage"),
  "CircuitTransactionsPage"
);

const AdminRoutes = lazy(() => import("./pages/admin/AdminRoutes"));
const DraftRoomPage = lazy(() =>
  import("./pages/DraftRoomPage").then((m) => ({ default: m.DraftRoomPage }))
);
const DraftCeremonyPreviewPage = lazy(() =>
  import("./pages/draft/DraftCeremonyPreviewPage").then((m) => ({
    default: m.DraftCeremonyPreviewPage
  }))
);
const DraftPlansPage = lazy(() =>
  import("./pages/DraftPlansPage").then((m) => ({ default: m.DraftPlansPage }))
);

// Test builds only (VITE_FO_ENABLE_SPECIMEN=1). The flag is replaced at build time, so in
// production this is `null` and the import below is dropped with its module.
const SpecimenPage =
  import.meta.env.VITE_FO_ENABLE_SPECIMEN === "1"
    ? lazy(() => import("./pages/SpecimenPage"))
    : null;

function RoutesConfig() {
  return (
    <Routes>
      {SpecimenPage ? (
        <Route
          path="/__specimen"
          element={
            <LazyRoute>
              <SpecimenPage />
            </LazyRoute>
          }
        />
      ) : null}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <RegisterPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <RedirectIfAuthed>
              <ForgotPasswordPage />
            </RedirectIfAuthed>
          }
        />
        {/* Not redirected when signed in: the link must work in a browser that has a session. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset" element={<Navigate to="/login" replace />} />
        <Route path="/reset/confirm" element={<Navigate to="/login" replace />} />
      </Route>
      <Route element={<ShellLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/about"
          element={
            <LazyRoute>
              <AboutPage />
            </LazyRoute>
          }
        />
        <Route
          path="/code-of-conduct"
          element={
            <LazyRoute>
              <CodeOfConductPage />
            </LazyRoute>
          }
        />
        <Route
          path="/disclaimer"
          element={
            <LazyRoute>
              <DisclaimerPage />
            </LazyRoute>
          }
        />
        <Route
          path="/faq"
          element={
            <LazyRoute>
              <FaqPage />
            </LazyRoute>
          }
        />
        <Route
          path="/contact"
          element={
            <LazyRoute>
              <ContactPage />
            </LazyRoute>
          }
        />
        <Route
          path="/feedback"
          element={
            <LazyRoute>
              <FeedbackPage />
            </LazyRoute>
          }
        />
        <Route
          path="/how-it-works"
          element={
            <LazyRoute>
              <HowItWorksPage />
            </LazyRoute>
          }
        />
        <Route
          path="/privacy"
          element={
            <LazyRoute>
              <PrivacyPage />
            </LazyRoute>
          }
        />
        <Route
          path="/terms"
          element={
            <LazyRoute>
              <TermsPage />
            </LazyRoute>
          }
        />
        <Route path="/results" element={<Navigate to="/ceremonies" replace />} />
        <Route
          path="/leagues"
          element={
            <RequireAuth>
              <LazyRoute>
                <LeaguesPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/new"
          element={
            <RequireAuth>
              <LazyRoute>
                <LeagueCreatePage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug/seasons/new"
          element={
            <RequireAuth>
              <LazyRoute>
                <LeagueSeasonCreatePage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:id/seasons/new"
          element={
            <RequireAuth>
              <LazyRoute>
                <LeagueSeasonCreatePage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/seasons"
          element={
            <RequireAuth>
              <LazyRoute>
                <SeasonsIndexPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug/circuits/:circuitLeagueId"
          element={
            <RequireAuth>
              <LazyRoute>
                <CircuitLeaguePage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug/circuits/:circuitLeagueId/roster"
          element={
            <RequireAuth>
              <LazyRoute>
                <CircuitRosterPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug/circuits/:circuitLeagueId/transactions"
          element={
            <RequireAuth>
              <LazyRoute>
                <CircuitTransactionsPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug/:ceremonyCode"
          element={
            <RequireAuth>
              <LazyRoute>
                <SeasonPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug"
          element={
            <RequireAuth>
              <LazyRoute>
                <LeagueDetailPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:id"
          element={
            <RequireAuth>
              <LazyRoute>
                <LeagueDetailPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        {/* Lightweight legacy season route fallback. */}
        <Route
          path="/seasons/:id"
          element={
            <RequireAuth>
              <LazyRoute>
                <SeasonPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/invites/:token"
          element={
            <LazyRoute>
              <InviteClaimPage />
            </LazyRoute>
          }
        />
        <Route
          path="/invites"
          element={
            <RequireAuth>
              <LazyRoute>
                <InvitesInboxPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/ceremonies"
          element={
            <RequireAuth>
              <LazyRoute>
                <CeremoniesPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/ceremonies/:id"
          element={
            <RequireAuth>
              <LazyRoute>
                <CeremonyPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/ceremonies/:id/draft-plans"
          element={
            <RequireAuth>
              <LazyRoute>
                <DraftPlansPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <LazyRoute>
                <AccountPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/*"
          element={
            <RequireAdmin>
              <LazyRoute>
                <AdminRoutes />
              </LazyRoute>
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<DraftLayout />}>
        <Route
          path="/drafts/preview/ceremonies/:ceremonyId"
          element={
            <RequireAdmin>
              <LazyRoute>
                <DraftCeremonyPreviewPage />
              </LazyRoute>
            </RequireAdmin>
          }
        />
        <Route
          path="/drafts/:id"
          element={
            <RequireAuth>
              <LazyRoute>
                <DraftRoomPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => registerWriteInvalidation(queryClient), [queryClient]);
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrandProvider>
            <RoutesConfig />
          </BrandProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
