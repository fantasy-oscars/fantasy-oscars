import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Box, Button, Grid, Skeleton, Stack, Text, Title } from "@ui";
import { useAuthContext } from "@/auth/context";
import { useInviteClaimOrchestration } from "@/orchestration/invites";
import { notify } from "@/notifications";
import { PageError } from "@/shared/page-state";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function InviteClaimPage() {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuthContext();
  const { loading, result, accept, decline } = useInviteClaimOrchestration({ token });
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
  const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;
  const registerHref = `/register?next=${encodeURIComponent(returnTo)}`;

  function notifyInvitesChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("fo:invites-changed"));
  }

  async function onAcceptInvite() {
    const res = await accept();
    if (!res.ok) {
      navigate("/invites", { replace: true, state: { inviteClaimError: res.error } });
      return;
    }
    notifyInvitesChanged();
    notify({
      id: "invites.claim.accepted",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Invite accepted"
    });
    navigate("/invites", { replace: true, state: { inviteClaimed: true } });
  }

  async function onDeclineInvite() {
    const res = await decline();
    if (!res.ok) {
      navigate("/invites", { replace: true, state: { inviteClaimError: res.error } });
      return;
    }
    notifyInvitesChanged();
    notify({
      id: "invites.claim.declined",
      severity: "info",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Invite declined"
    });
    navigate("/invites", { replace: true, state: { inviteClaimed: false } });
  }

  if (authLoading) {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Grid className="card-grid" gutter="lg" role="status" aria-label="Checking session">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <StandardCard component="section">
                <Stack gap="sm">
                  <Skeleton height="var(--fo-font-size-hero-title)" width="82%" />
                  <Skeleton height="var(--fo-font-size-sm)" width="92%" />
                  <Skeleton height="36px" width="180px" />
                </Stack>
              </StandardCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <StandardCard tone="nested" component="section">
                <Stack gap="sm">
                  <Skeleton height="var(--fo-font-size-sm)" width="58%" />
                  <Skeleton height="var(--fo-font-size-sm)" width="88%" />
                  <Skeleton height="36px" width="150px" />
                </Stack>
              </StandardCard>
            </Grid.Col>
          </Grid>
        </Box>
      </Box>
    );
  }
  if (!user) {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Grid className="card-grid" gutter="lg">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <StandardCard component="section">
                <Stack gap="sm">
                  <Box component="header">
                    <Title variant="page">You are opening an invite link</Title>
                    <Text variant="helper">
                      Sign in to claim your season invitation and continue.
                    </Text>
                  </Box>
                  <Button component={Link} to={loginHref}>
                    Sign in to claim invite
                  </Button>
                </Stack>
              </StandardCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <StandardCard tone="nested" component="section">
                <Stack gap="sm">
                  <Box component="header">
                    <Title variant="card">Need an account?</Title>
                    <Text>Create one first, then return to this invite link.</Text>
                  </Box>
                  <Button component={Link} to={registerHref} variant="outline">
                    Create account
                  </Button>
                </Stack>
              </StandardCard>
            </Grid.Col>
          </Grid>
        </Box>
      </Box>
    );
  }
  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Grid className="card-grid" gutter="lg">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <StandardCard component="section">
              <Stack gap="sm">
                <Box component="header">
                  <Title variant="page">Claim invitation</Title>
                  <Text variant="helper">
                    Accept this invite to join the season, or decline it.
                  </Text>
                </Box>
                {result && !result.ok ? <PageError message={result.message} /> : null}
                <Stack gap="xs">
                  <Button
                    type="button"
                    onClick={() => void onAcceptInvite()}
                    disabled={loading}
                  >
                    {loading ? "Working..." : "Accept invite"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onDeclineInvite()}
                    disabled={loading}
                  >
                    Decline invite
                  </Button>
                </Stack>
              </Stack>
            </StandardCard>
          </Grid.Col>
        </Grid>
      </Box>
    </Box>
  );
}
