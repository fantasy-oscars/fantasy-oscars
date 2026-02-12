import { Box } from "@ui";

export function DraftCategoryIcon(props: {
  icon: string;
  variant: "default" | "inverted";
  className?: string;
}) {
  if (props.variant === "inverted") {
    return (
      <Box
        component="span"
        className={["mi-icon mi-icon-tiny dr-icon-punchout", props.className ?? ""].join(
          " "
        )}
        aria-hidden="true"
      >
        {props.icon}
      </Box>
    );
  }
  return (
    <Box
      component="span"
      className={["mi-icon mi-icon-tiny", props.className ?? ""].join(" ")}
      aria-hidden="true"
    >
      {props.icon}
    </Box>
  );
}
