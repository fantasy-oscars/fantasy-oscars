import { Link } from "react-router-dom";
import { Box, Button, Card, Group, Stack, Text, TextInput } from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import type { ApiResult } from "../../../lib/types";
import type { AdminUserRow } from "../../../orchestration/adminUsers";

export function AdminUsersSearchScreen(props: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  status: ApiResult | null;
  results: AdminUserRow[];
  onSearch: () => void;
}) {
  const { query, setQuery, searching, status, results, onSearch } = props;

  return (
    <Stack component="section" className="stack">
      <Group className="inline-form" wrap="wrap" align="flex-end">
        <TextInput
          label="Username or email"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Start typing..."
        />
        <Button type="button" disabled={searching} onClick={onSearch}>
          {searching ? "Searching..." : "Search"}
        </Button>
      </Group>

      <FormStatus loading={searching} result={status} />

      {results.length === 0 ? (
        <Card className="empty-state">
          <Text fw={700}>No results.</Text>
          <Text className="muted" mt="xs">
            Enter a username or email and run a search.
          </Text>
        </Card>
      ) : (
        <Stack component="ul" className="list" aria-label="User results">
          {results.map((u) => (
            <Box key={u.id} component="li" className="list-row">
              <Box>
                <Text fw={700}>{u.username}</Text>
                <Text className="muted">{u.email}</Text>
              </Box>
              <Group className="inline-actions" wrap="wrap">
                {u.is_admin ? (
                  <Box component="span" className="pill">
                    Admin
                  </Box>
                ) : null}
                <Button component={Link} variant="subtle" to={`/admin/users/${u.id}`}>
                  Open
                </Button>
              </Group>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
