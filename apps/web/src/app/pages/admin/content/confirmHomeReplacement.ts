import { confirm } from "@/notifications";

/**
 * Publishing a Home announcement unpublishes the one that is live. Ask first when
 * there is one; resolve true straight away when nothing is replaced.
 */
export function confirmHomeReplacement(replaced: { title: string } | null) {
  if (!replaced) return Promise.resolve(true);
  return confirm({
    title: "Replace the Home announcement?",
    message: `Only one Home announcement is published at a time. Publishing this one unpublishes "${
      replaced.title || "(untitled)"
    }".`,
    confirmLabel: "Publish",
    cancelLabel: "Cancel"
  });
}
