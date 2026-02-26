import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/context";
import {
  RedirectIfAuthed,
  RequireAdmin,
  RequireAuth,
  RequireSuperAdmin
} from "@/auth/guards";
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
import { DraftPlansPage } from "./pages/DraftPlansPage";
import { SeasonsIndexPage } from "./pages/SeasonsIndexPage";
import { SeasonPage } from "./pages/SeasonPage";
import { DraftRoomPage } from "./pages/DraftRoomPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminHomePage } from "./pages/admin/AdminHomePage";
import { AdminCeremoniesLayout } from "./pages/admin/ceremonies/AdminCeremoniesLayout";
import { AdminCeremoniesIndexPage } from "./pages/admin/ceremonies/AdminCeremoniesIndexPage";
import { AdminCeremonyPreviewPage } from "./pages/admin/ceremonies/AdminCeremonyPreviewPage";
import { AdminCeremonyWizardPage } from "./pages/admin/ceremonies/AdminCeremonyWizardPage";
import { DraftCeremonyPreviewPage } from "./pages/draft/DraftCeremonyPreviewPage";
import { AdminUsersLayout } from "./pages/admin/users/AdminUsersLayout";
import { AdminUsersSearchPage } from "./pages/admin/users/AdminUsersSearchPage";
import { AdminCategoryTemplatesPage } from "./pages/admin/categoryTemplates/AdminCategoryTemplatesPage";
import { AdminFilmsPage } from "./pages/admin/films/AdminFilmsPage";
import { AdminContentLayout } from "./pages/admin/content/AdminContentLayout";
import { AdminContentHomePage } from "./pages/admin/content/AdminContentHomePage";
import { AdminStaticContentEditorPage } from "./pages/admin/content/AdminStaticContentEditorPage";
import { AdminDynamicContentLedgerPage } from "./pages/admin/content/AdminDynamicContentLedgerPage";
import { AdminDynamicContentEditorPage } from "./pages/admin/content/AdminDynamicContentEditorPage";
import { AdminSafeguardsPage } from "./pages/admin/safeguards/AdminSafeguardsPage";
import { AdminSystemLayout } from "./pages/admin/system/AdminSystemLayout";
import { AdminSystemAuditLogPage } from "./pages/admin/system/AdminSystemAuditLogPage";
import { NotFoundPage } from "./pages/NotFoundPage";

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
        <Route
          path="/invites/:token"
          element={<InviteClaimPage />}
        />
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
              <DraftPlansPage />
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
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminHomePage />} />
          <Route path="ceremonies">
            <Route index element={<AdminCeremoniesIndexPage />} />
            <Route path=":ceremonyId" element={<AdminCeremoniesLayout />}>
              <Route index element={<AdminCeremonyWizardPage />} />
              <Route path="preview" element={<AdminCeremonyPreviewPage />} />
              <Route path="*" element={<AdminCeremonyWizardPage />} />
            </Route>
          </Route>

          <Route path="users" element={<AdminUsersLayout />}>
            <Route
              index
              element={
                <RequireSuperAdmin>
                  <AdminUsersSearchPage />
                </RequireSuperAdmin>
              }
            />
          </Route>

          <Route path="category-templates" element={<AdminCategoryTemplatesPage />} />

          <Route path="films" element={<AdminFilmsPage />} />

          <Route path="content" element={<AdminContentLayout />}>
            <Route index element={<AdminContentHomePage />} />
            <Route path="static/:key" element={<AdminStaticContentEditorPage />} />
            <Route path="dynamic/:key" element={<AdminDynamicContentLedgerPage />} />
            <Route
              path="dynamic/:key/drafts/:id"
              element={<AdminDynamicContentEditorPage />}
            />
          </Route>

          <Route
            path="destructive-actions"
            element={
              <RequireSuperAdmin>
                <AdminSafeguardsPage />
              </RequireSuperAdmin>
            }
          />

          <Route path="system" element={<AdminSystemLayout />}>
            <Route path="audit" element={<AdminSystemAuditLogPage />} />
            <Route index element={<Navigate to="audit" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<DraftLayout />}>
        <Route
          path="/drafts/preview/ceremonies/:ceremonyId"
          element={
            <RequireAdmin>
              <DraftCeremonyPreviewPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/drafts/:id"
          element={
            <RequireAuth>
              <DraftRoomPage />
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoutesConfig />
      </AuthProvider>
    </BrowserRouter>
  );
}
