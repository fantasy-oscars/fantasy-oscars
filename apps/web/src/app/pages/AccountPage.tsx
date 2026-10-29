import { useAuthContext } from "@/auth/context";
import { AccountScreen } from "@/features/account/screens/AccountScreen";
import { useAccountOrchestration } from "@/orchestration/account/orchestration";

export function AccountPage() {
  const { user, logout } = useAuthContext();
  const account = useAccountOrchestration();

  async function deleteAccount() {
    const res = await account.deleteAccount();
    if (!res.ok) return res;
    await logout();
    return res;
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
