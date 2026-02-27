import { Box } from "@ui";
import { materialGlyph } from "@/decisions/admin/materialGlyph";

export function DraftCategoryIcon(props: {
  icon: string;
  variant: "default" | "inverted";
  className?: string;
}) {
  const glyph = materialGlyph(props.icon);
  if (props.variant === "inverted") {
    return (
      <Box
        component="span"
        className={["mi-icon mi-icon-tiny dr-icon-punchout", props.className ?? ""].join(
          " "
        )}
        aria-hidden="true"
      >
        {glyph}
      </Box>
    );
  }
  return (
    <Box
      component="span"
      className={["mi-icon mi-icon-tiny", props.className ?? ""].join(" ")}
      aria-hidden="true"
    >
      {glyph}
    </Box>
  );
}
