import { useAuthContext } from "@/auth/context";
import { AccountScreen } from "@/features/account/screens/AccountScreen";

export function AccountPage() {
  const { user, logout } = useAuthContext();
  return (
    <AccountScreen
      username={user?.username ?? null}
      email={user?.email ?? null}
      onLogout={() => void logout()}
    />
  );
}
