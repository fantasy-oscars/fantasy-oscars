import { lazy, useEffect, useState } from "react";
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
import { AboutPage } from "./pages/AboutPage";
import { CodeOfConductPage } from "./pages/CodeOfConductPage";
import { ContactPage } from "./pages/ContactPage";
import { DisclaimerPage } from "./pages/DisclaimerPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { FaqPage } from "./pages/FaqPage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { LeaguesPage } from "./pages/LeaguesPage";
import { LeagueCreatePage } from "./pages/LeagueCreatePage";
import { LeagueDetailPage } from "./pages/LeagueDetailPage";
import { LeagueSeasonCreatePage } from "./pages/LeagueSeasonCreatePage";
import { InviteClaimPage } from "./pages/InviteClaimPage";
import { InvitesInboxPage } from "./pages/InvitesInboxPage";
import { AccountPage } from "./pages/AccountPage";
import { CeremoniesPage } from "./pages/CeremoniesPage";
import { CeremonyPage } from "./pages/CeremonyPage";
import { SeasonsIndexPage } from "./pages/SeasonsIndexPage";
import { SeasonPage } from "./pages/SeasonPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LazyRoute } from "./LazyRoute";
import { createQueryClient } from "@/orchestration/query/client";
import { registerWriteInvalidation } from "@/orchestration/query/invalidate";

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

function RoutesConfig() {
  return (
    <Routes>
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
        <Route path="/reset" element={<Navigate to="/login" replace />} />
        <Route path="/reset/confirm" element={<Navigate to="/login" replace />} />
      </Route>
      <Route element={<ShellLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/code-of-conduct" element={<CodeOfConductPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/results" element={<Navigate to="/ceremonies" replace />} />
        <Route
          path="/leagues"
          element={
            <RequireAuth>
              <LeaguesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/new"
          element={
            <RequireAuth>
              <LeagueCreatePage />
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug/seasons/new"
          element={
            <RequireAuth>
              <LeagueSeasonCreatePage />
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:id/seasons/new"
          element={
            <RequireAuth>
              <LeagueSeasonCreatePage />
            </RequireAuth>
          }
        />
        <Route
          path="/seasons"
          element={
            <RequireAuth>
              <SeasonsIndexPage />
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug/:ceremonyCode"
          element={
            <RequireAuth>
              <SeasonPage />
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:leagueId/:leagueSlug"
          element={
            <RequireAuth>
              <LeagueDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/leagues/:id"
          element={
            <RequireAuth>
              <LeagueDetailPage />
            </RequireAuth>
          }
        />
        {/* Lightweight legacy season route fallback. */}
        <Route
          path="/seasons/:id"
          element={
            <RequireAuth>
              <SeasonPage />
            </RequireAuth>
          }
        />
        <Route path="/invites/:token" element={<InviteClaimPage />} />
        <Route
          path="/invites"
          element={
            <RequireAuth>
              <InvitesInboxPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ceremonies"
          element={
            <RequireAuth>
              <CeremoniesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ceremonies/:id"
          element={
            <RequireAuth>
              <CeremonyPage />
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
              <AccountPage />
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
