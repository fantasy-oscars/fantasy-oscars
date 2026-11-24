import { Text } from "@ui";

/**
 * The line under the room's header while the draft cannot start yet (the
 * ceremony or season is not live). Everyone sees it; the commissioner's Start
 * draft is disabled beside it.
 */
export function DraftStartBlockedNote(props: { line: string | null }) {
  if (!props.line) return null;
  return (
    <Text className="dr-startNote" role="note">
      {props.line}
    </Text>
  );
}
