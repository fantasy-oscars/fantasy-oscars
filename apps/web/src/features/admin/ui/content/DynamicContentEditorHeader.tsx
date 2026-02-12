import { Box, Button, Group, Text, Title } from "@ui";
import { Link } from "react-router-dom";

export function DynamicContentEditorHeader(props: {
  title: string;
  statusText: string;
  backHref: string;
  viewOnly: boolean;
  busy: boolean;
  isSequential: boolean;
  isActive: boolean;
  onSave: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const {
    title,
    statusText,
    backHref,
    viewOnly,
    busy,
    isSequential,
    isActive,
    onSave,
    onActivate,
    onDeactivate,
    onDelete
  } = props;

  return (
    <Group
      className="header-with-controls"
      justify="space-between"
      align="start"
      wrap="wrap"
    >
      <Box>
        <Title order={3} className="baseline-textHeroTitle">
          {title}
        </Title>
        <Text className="baseline-textMeta" c="dimmed">
          {statusText}
        </Text>
      </Box>
      <Group className="inline-actions" wrap="wrap">
        <Button component={Link} variant="subtle" to={backHref}>
          Back
        </Button>
        {viewOnly ? null : (
          <>
            <Button type="button" onClick={onSave} disabled={busy}>
              Save
            </Button>
            {isSequential ? (
              !isActive ? (
                <Button type="button" onClick={onActivate} disabled={busy}>
                  Make active
                </Button>
              ) : null
            ) : (
              <Button
                type="button"
                variant="subtle"
                onClick={isActive ? onDeactivate : onActivate}
                disabled={busy}
              >
                {isActive ? "Deactivate" : "Activate"}
              </Button>
            )}
            {!isActive ? (
              <Button
                type="button"
                color="red"
                variant="outline"
                onClick={onDelete}
                disabled={busy}
              >
                Delete
              </Button>
            ) : null}
          </>
        )}
      </Group>
    </Group>
  );
}
