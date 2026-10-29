import { RequireSuperAdmin } from "@/auth/guards";
import { NotFoundPage } from "../NotFoundPage";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { AdminHomePage } from "./AdminHomePage";
import { AdminCeremoniesLayout } from "./ceremonies/AdminCeremoniesLayout";
import { AdminCeremoniesIndexPage } from "./ceremonies/AdminCeremoniesIndexPage";
import { AdminCeremonyPreviewPage } from "./ceremonies/AdminCeremonyPreviewPage";
import { AdminCeremonyWizardPage } from "./ceremonies/AdminCeremonyWizardPage";
import { AdminUsersLayout } from "./users/AdminUsersLayout";
import { AdminUsersSearchPage } from "./users/AdminUsersSearchPage";
import { AdminCategoryTemplatesPage } from "./categoryTemplates/AdminCategoryTemplatesPage";
import { AdminFilmsPage } from "./films/AdminFilmsPage";
import { AdminContentLayout } from "./content/AdminContentLayout";
import { AdminContentHomePage } from "./content/AdminContentHomePage";
import { AdminStaticContentEditorPage } from "./content/AdminStaticContentEditorPage";
import { AdminDynamicContentLedgerPage } from "./content/AdminDynamicContentLedgerPage";
import { AdminDynamicContentEditorPage } from "./content/AdminDynamicContentEditorPage";
import { AdminSafeguardsPage } from "./safeguards/AdminSafeguardsPage";
import { AdminSystemLayout } from "./system/AdminSystemLayout";
import { AdminSystemAuditLogPage } from "./system/AdminSystemAuditLogPage";

/** The whole admin console; loaded lazily so non-admin visitors never download it. */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
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
    </Routes>
  );
}
