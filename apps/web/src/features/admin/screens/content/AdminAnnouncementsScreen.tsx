import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Text
} from "@ui";
import { FormStatus } from "@/shared/forms";
import {
  ANNOUNCEMENT_TYPE_LABEL,
  announcementStatusLabel,
  announcementTypeForKey,
  filterAnnouncements,
  formatDateTimeForHumans,
  formatSchedule,
  type AnnouncementFilter,
  type AnnouncementType
} from "@/decisions/adminContent";
import type { ApiResult } from "@/lib/types";
import type { CmsDynamicRow } from "@/orchestration/adminContent";
import "@/primitives/baseline.css";

const FILTER_OPTIONS: Array<{ value: AnnouncementFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "home", label: ANNOUNCEMENT_TYPE_LABEL.home },
  { value: "banner", label: ANNOUNCEMENT_TYPE_LABEL.banner }
];

function emptyText(filter: AnnouncementFilter) {
  if (filter === "home") return "No Home announcements yet.";
  if (filter === "banner") return "No banners yet.";
  return "No announcements yet.";
}

function entryMeta(entry: CmsDynamicRow, type: AnnouncementType | null) {
  const parts = [
    type ? ANNOUNCEMENT_TYPE_LABEL[type] : entry.key,
    announcementStatusLabel(entry.status)
  ];
  if (type === "banner") {
    const schedule = formatSchedule(entry.starts_at, entry.ends_at);
    if (schedule) parts.push(schedule);
  }
  parts.push(`updated ${formatDateTimeForHumans(entry.updated_at)}`);
  return parts.join(" • ");
}

export function AdminAnnouncementsScreen(props: {
  loading: boolean;
  busy: boolean;
  status: ApiResult | null;
  entries: CmsDynamicRow[];
  filter: AnnouncementFilter;
  onFilterChange: (filter: AnnouncementFilter) => void;
  onCreate: (type: AnnouncementType) => void;
  onPublish: (entry: CmsDynamicRow) => void;
  onUnpublish: (entry: CmsDynamicRow) => void;
}) {
  const {
    loading,
    busy,
    status,
    entries,
    filter,
    onFilterChange,
    onCreate,
    onPublish,
    onUnpublish
  } = props;

  const visible = filterAnnouncements(entries, filter);

  return (
    <Stack component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="center"
        wrap="wrap"
      >
        <SegmentedControl
          aria-label="Filter by type"
          className="admin-announcementsFilter"
          value={filter}
          onChange={(v) => onFilterChange(v as AnnouncementFilter)}
          data={FILTER_OPTIONS}
        />
        <Group className="inline-actions" wrap="wrap">
          <Button type="button" onClick={() => onCreate("home")} disabled={busy}>
            New Home announcement
          </Button>
          <Button
            type="button"
            variant="subtle"
            onClick={() => onCreate("banner")}
            disabled={busy}
          >
            New banner
          </Button>
        </Group>
      </Group>

      <FormStatus loading={busy} result={status} />

      {loading ? (
        <Stack gap="var(--fo-space-0)" role="status" aria-label="Loading announcements">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Box key={idx}>
              <Group justify="space-between" align="center" wrap="wrap" py="sm">
                <Stack gap="var(--fo-space-4)">
                  <Skeleton height="var(--fo-font-size-sm)" width="180px" />
                  <Skeleton height="var(--fo-font-size-xs)" width="240px" />
                </Stack>
                <Skeleton height="30px" width="140px" />
              </Group>
              {idx === 3 ? null : <Divider />}
            </Box>
          ))}
        </Stack>
      ) : visible.length === 0 ? (
        <Text className="baseline-textBody" c="dimmed">
          {emptyText(filter)}
        </Text>
      ) : (
        <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
          {visible.map((e, idx) => {
            const type = announcementTypeForKey(e.key);
            const published = e.status === "PUBLISHED";
            const label = e.title || "(untitled)";
            return (
              <Box key={`${e.key}-${e.id}`} component="li">
                <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
                  <Box>
                    <Text
                      fw="var(--fo-font-weight-semibold)"
                      className="baseline-textBody"
                    >
                      {label}
                    </Text>
                    <Text className="baseline-textMeta" c="dimmed">
                      {entryMeta(e, type)}
                    </Text>
                  </Box>
                  <Group className="inline-actions" wrap="wrap">
                    <Button
                      component={Link}
                      variant="subtle"
                      to={`/admin/content/dynamic/${e.key}/drafts/${e.id}`}
                      aria-label={`Edit ${label}`}
                    >
                      Edit
                    </Button>
                    {!published ? (
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={() => onPublish(e)}
                        disabled={busy}
                        aria-label={`Publish ${label}`}
                      >
                        Publish
                      </Button>
                    ) : type === "banner" ? (
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={() => onUnpublish(e)}
                        disabled={busy}
                        aria-label={`Unpublish ${label}`}
                      >
                        Unpublish
                      </Button>
                    ) : null}
                  </Group>
                </Group>
                {idx === visible.length - 1 ? null : <Divider />}
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
