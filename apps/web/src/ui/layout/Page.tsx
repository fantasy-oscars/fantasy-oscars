import type { PropsWithChildren } from "react";
import { Box } from "@ui";

export function Page(props: PropsWithChildren<{ "aria-label"?: string }>) {
  return (
    <Box className="baseline-page" aria-label={props["aria-label"]}>
      <Box className="baseline-pageInner">{props.children}</Box>
    </Box>
  );
}
