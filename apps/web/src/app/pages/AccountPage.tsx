import { useAuthContext } from "@/auth/context";
import { AccountScreen } from "@/features/account/screens/AccountScreen";
import { fetchJson } from "@/lib/api";

export function AccountPage() {
  const { user, logout } = useAuthContext();

  async function deleteAccount() {
    const res = await fetchJson("/auth/me", { method: "DELETE" });
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    await logout();
    return { ok: true as const };
  }

  return (
    <AccountScreen
      username={user?.username ?? null}
      email={user?.email ?? null}
      onLogout={() => void logout()}
      onDeleteAccount={deleteAccount}
    />
  );
}
