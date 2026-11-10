import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useMediaQuery } from "@ui/hooks";
import { focusAppearanceHeading } from "@/app/chrome/appearanceAnchor";
import { useAuthContext, type AuthUser } from "@/auth/context";
import { useBrandContext } from "@/brand/context";
import { AccountScreen } from "@/features/account/screens/AccountScreen";
import { saveStatusText } from "@/decisions/appearance";
import { useAccountOrchestration } from "@/orchestration/account/orchestration";
import { useAppearanceOrchestration } from "@/orchestration/account/useAppearanceOrchestration";

/** Below this width the segmented controls stack (matches the phone rules in styles.css). */
const PHONE_QUERY = "(max-width: 499.98px)";

/** Scrolls to and focuses the Appearance heading for `/account#appearance`. */
function useAppearanceAnchor() {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (hash !== "#appearance") return;
    focusAppearanceHeading();
  }, [hash, key]);
}

function SignedInAccount(props: { user: AuthUser; logout: () => Promise<void> }) {
  const { user, logout } = props;
  const account = useAccountOrchestration();
  const { brand, show } = useBrandContext();
  const phone = useMediaQuery(PHONE_QUERY, false, { getInitialValueInEffect: false });
  const appearance = useAppearanceOrchestration({ user, currentBrand: brand, show });
  useAppearanceAnchor();

  async function deleteAccount() {
    const res = await account.deleteAccount();
    if (!res.ok) return res;
    await logout();
    return res;
  }

  return (
    <AccountScreen
      username={user.username ?? null}
      email={user.email ?? null}
      onLogout={() => void logout()}
      onDeleteAccount={deleteAccount}
      appearance={{
        view: appearance.view,
        statusText: saveStatusText(appearance.status),
        failure: appearance.failed,
        onRetry: appearance.retry,
        vertical: phone,
        onModeChange: (mode) => appearance.change({ kind: "mode", mode }),
        onSelectionChange: (selection) =>
          appearance.change({ kind: "selection", selection }),
        onFixedChange: (brandId) => appearance.change({ kind: "fixed", brand: brandId }),
        onRandomChange: (value) => appearance.change({ kind: "random-list", value }),
        onPolicyChange: (policy) => appearance.change({ kind: "policy", policy })
      }}
    />
  );
}

export function AccountPage() {
  const { user, logout } = useAuthContext();
  // The route guard keeps signed-out visitors out; this only covers the frame in
  // which a logout has started.
  if (!user) return null;
  return <SignedInAccount user={user} logout={logout} />;
}
