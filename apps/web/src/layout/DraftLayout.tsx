import { Outlet } from "react-router-dom";
import { SiteFooter } from "./SiteFooter";

export function DraftLayout() {
  return (
    <div className="page draft-page">
      <div className="draft-page-inner">
        <main className="draft-content">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
