import {
  Box,
  Button,
  Combobox,
  Divider,
  Group,
  Stack,
  Select,
  Text,
  TextInput,
  useCombobox
} from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import type { AdminUserRow } from "@/orchestration/adminUsers";
import "@/primitives/baseline.css";

export function AdminUsersSearchScreen(props: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  status: ApiResult | null;
  results: AdminUserRow[];
  onSearch: () => void;
  updatingById: Record<number, boolean>;
  onSetRole: (user: AdminUserRow, nextRole: "NONE" | "OPERATOR" | "SUPER_ADMIN") => void;
  onRemoveUser: (user: AdminUserRow) => void;
}) {
  const {
    query,
    setQuery,
    searching,
    status,
    results,
    onSearch,
    updatingById,
    onSetRole,
    onRemoveUser
  } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const options = results.slice(0, 8).map((u) => (
    <Combobox.Option key={u.id} value={String(u.id)}>
      <Box miw="var(--fo-space-0)">
        <Text
          fw="var(--fo-font-weight-semibold)"
          className="baseline-textBody"
          truncate="end"
        >
          {u.username}
        </Text>
      </Box>
    </Combobox.Option>
  ));

  return (
    <Stack component="section">
      <Group className="inline-form" wrap="wrap" align="flex-end">
        <Combobox
          store={combobox}
          withinPortal
          position="bottom-start"
          middlewares={{ flip: true, shift: true }}
          onOptionSubmit={(value) => {
            const u = results.find((r) => String(r.id) === value);
            if (u) setQuery(u.username);
            combobox.closeDropdown();
          }}
        >
          <Combobox.Target>
            <TextInput
              aria-label="Username"
              name="admin_user_search"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore
              value={query}
              onChange={(e) => {
                setQuery(e.currentTarget.value);
                combobox.openDropdown();
              }}
              onFocus={() => combobox.openDropdown()}
              onBlur={() => combobox.closeDropdown()}
              placeholder="Username"
            />
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Options>
              {options.length > 0 ? options : <Combobox.Empty>No results</Combobox.Empty>}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
        <Button
          type="button"
          variant="default"
          color="gray"
          disabled={searching}
          onClick={onSearch}
        >
          {searching ? "Searching..." : "Search"}
        </Button>
      </Group>

      <FormStatus loading={searching} result={status} />

      {results.length === 0 ? (
        <Stack gap="var(--fo-space-8)">
          <Text className="baseline-textBody" c="dimmed">
            No results
          </Text>
          <Text className="baseline-textBody" c="dimmed">
            Enter a username or email to search.
          </Text>
        </Stack>
      ) : (
        <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
          {results.map((u, idx) => (
            <Box key={u.id} component="li">
              <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
                <Box miw="var(--fo-space-0)">
                  <Text
                    fw="var(--fo-font-weight-semibold)"
                    className="baseline-textBody"
                    truncate="end"
                  >
                    {u.username}
                  </Text>
                </Box>
                <Group gap="xs" justify="flex-end" wrap="nowrap" style={{ marginLeft: "auto" }}>
                  <Select
                    aria-label="Role"
                    data={[
                      { value: "NONE", label: "User" },
                      { value: "OPERATOR", label: "Operator" },
                      { value: "SUPER_ADMIN", label: "Super Admin" }
                    ]}
                    value={u.admin_role}
                    disabled={Boolean(updatingById[u.id])}
                    onChange={(v) => {
                      if (!v) return;
                      if (v !== "NONE" && v !== "OPERATOR" && v !== "SUPER_ADMIN") return;
                      onSetRole(u, v);
                    }}
                    size="xs"
                  />
                  <Button
                    type="button"
                    variant="subtle"
                    color="red"
                    disabled={Boolean(updatingById[u.id])}
                    onClick={() => onRemoveUser(u)}
                  >
                    Remove
                  </Button>
                </Group>
              </Group>
              {idx === results.length - 1 ? null : <Divider />}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
