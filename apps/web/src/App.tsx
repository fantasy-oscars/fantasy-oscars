import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/context";
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from "./auth/guards";
import { ShellLayout } from "./layout/ShellLayout";
import { DraftLayout } from "./layout/DraftLayout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetConfirmPage } from "./pages/ResetConfirmPage";
import { ResetRequestPage } from "./pages/ResetRequestPage";
import { AboutPage } from "./pages/AboutPage";
import { CodeOfConductPage } from "./pages/CodeOfConductPage";
import { ContactPage } from "./pages/ContactPage";
import { FaqPage } from "./pages/FaqPage";
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
import { SeasonsIndexPage } from "./pages/SeasonsIndexPage";
import { SeasonPage } from "./pages/SeasonPage";
import { DraftRoomPage } from "./pages/DraftRoomPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminHomePage } from "./pages/admin/AdminHomePage";
import { AdminCeremoniesLayout } from "./pages/admin/ceremonies/AdminCeremoniesLayout";
import { AdminCeremoniesIndexPage } from "./pages/admin/ceremonies/AdminCeremoniesIndexPage";
import { AdminCeremoniesOverviewPage } from "./pages/admin/ceremonies/AdminCeremoniesOverviewPage";
import { AdminCeremoniesCategoriesPage } from "./pages/admin/ceremonies/AdminCeremoniesCategoriesPage";
import { AdminCeremoniesNomineesPage } from "./pages/admin/ceremonies/AdminCeremoniesNomineesPage";
import { AdminCeremoniesWinnersPage } from "./pages/admin/ceremonies/AdminCeremoniesWinnersPage";
import { AdminCeremoniesScoringPage } from "./pages/admin/ceremonies/AdminCeremoniesScoringPage";
import { AdminCeremoniesLockPage } from "./pages/admin/ceremonies/AdminCeremoniesLockPage";
import { AdminUsersLayout } from "./pages/admin/users/AdminUsersLayout";
import { AdminUsersSearchPage } from "./pages/admin/users/AdminUsersSearchPage";
import { AdminUserDetailPage } from "./pages/admin/users/AdminUserDetailPage";
import { AdminContentLayout } from "./pages/admin/content/AdminContentLayout";
import { AdminContentHomePage } from "./pages/admin/content/AdminContentHomePage";
import { AdminStaticContentEditorPage } from "./pages/admin/content/AdminStaticContentEditorPage";
import { AdminDynamicContentLedgerPage } from "./pages/admin/content/AdminDynamicContentLedgerPage";
import { AdminDynamicContentEditorPage } from "./pages/admin/content/AdminDynamicContentEditorPage";
import { AdminSystemLayout } from "./pages/admin/system/AdminSystemLayout";
import { AdminSystemAuditLogPage } from "./pages/admin/system/AdminSystemAuditLogPage";
import { NotFoundPage } from "./pages/NotFoundPage";

function RoutesConfig() {
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route path="/" element={<HomePage />} />
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
          path="/reset"
          element={
            <RedirectIfAuthed>
              <ResetRequestPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/reset/confirm"
          element={
            <RedirectIfAuthed>
              <ResetConfirmPage />
            </RedirectIfAuthed>
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/code-of-conduct" element={<CodeOfConductPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/contact" element={<ContactPage />} />
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
          path="/leagues/:id"
          element={
            <RequireAuth>
              <LeagueDetailPage />
            </RequireAuth>
          }
        />
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
          element={
            <RequireAuth>
              <InviteClaimPage />
            </RequireAuth>
          }
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
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AdminCeremoniesOverviewPage />} />
              <Route path="categories" element={<AdminCeremoniesCategoriesPage />} />
              <Route path="nominees" element={<AdminCeremoniesNomineesPage />} />
              <Route path="winners" element={<AdminCeremoniesWinnersPage />} />
              <Route path="scoring" element={<AdminCeremoniesScoringPage />} />
              <Route path="lock" element={<AdminCeremoniesLockPage />} />
            </Route>
          </Route>

          <Route path="users" element={<AdminUsersLayout />}>
            <Route index element={<AdminUsersSearchPage />} />
            <Route path=":userId" element={<AdminUserDetailPage />} />
          </Route>

          <Route path="content" element={<AdminContentLayout />}>
            <Route index element={<AdminContentHomePage />} />
            <Route path="static/:key" element={<AdminStaticContentEditorPage />} />
            <Route path="dynamic/:key" element={<AdminDynamicContentLedgerPage />} />
            <Route
              path="dynamic/:key/drafts/:id"
              element={<AdminDynamicContentEditorPage />}
            />
          </Route>

          <Route path="system" element={<AdminSystemLayout />}>
            <Route path="audit" element={<AdminSystemAuditLogPage />} />
            <Route index element={<Navigate to="audit" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<DraftLayout />}>
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
