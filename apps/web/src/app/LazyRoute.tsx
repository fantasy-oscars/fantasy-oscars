import { Component, Suspense, useEffect, type ReactNode } from "react";
import { Button, Stack } from "@ui";
import { PageError, PageLoader } from "@/shared/page-state";

const RELOAD_FLAG = "fo:chunk-reload";

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|importing a module script failed|loading chunk|loading css chunk|failed to fetch dynamically/i.test(
    message
  );
}

function reloadOnce(): boolean {
  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG)) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

// Mounts only once the lazy route has loaded, re-arming the automatic reload
// for the next stale deploy.
function ClearReloadFlag() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // Storage unavailable; the manual Reload button still works.
    }
  }, []);
  return null;
}

type BoundaryState = { error: unknown };

/**
 * Catches failures while loading a lazy route (typically a stale tab whose chunk
 * was replaced by a deploy). Reloads once automatically, then offers a manual reload.
 */
class RouteErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (isChunkLoadError(error)) reloadOnce();
  }

  render() {
    if (this.state.error === null) return this.props.children;
    const stale = isChunkLoadError(this.state.error);
    return (
      <Stack gap="sm" className="page-state">
        <PageError
          message={
            stale
              ? "A newer version of the app is available. Reload to continue."
              : "Something went wrong loading this page."
          }
        />
        <div>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </Stack>
    );
  }
}

export function LazyRoute(props: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageLoader label="Loading..." />}>
        {props.children}
        <ClearReloadFlag />
      </Suspense>
    </RouteErrorBoundary>
  );
}
