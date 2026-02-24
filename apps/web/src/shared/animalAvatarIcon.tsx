import React from "react";
import { Box } from "@ui";
import { getAnimalAvatarCssMaskUrl } from "./animalAvatar";
import { useCssVars } from "./dom/useCssVars";

type AnimalAvatarSize = "sm" | "md" | "lg" | "draft";

const SIZE_CSS: Record<AnimalAvatarSize, string> = {
  sm: "var(--fo-avatar-size-sm)", // 22px
  md: "calc(var(--fo-avatar-size-sm) + var(--fo-space-2))", // 24px
  lg: "calc(var(--fo-avatar-size-sm) + var(--fo-space-4))", // 26px
  draft: "var(--fo-db-tokenSize)" // 33px
};

export function AnimalAvatarIcon(props: {
  avatarKey?: string | null;
  size?: AnimalAvatarSize;
}) {
  // Keep element reference stable for the useCssVars hook.
  const elRef = React.useRef<HTMLSpanElement | null>(null);
  const setRef = (node: HTMLSpanElement | null) => {
    elRef.current = node;
  };

  const sizeCss = SIZE_CSS[props.size ?? "sm"];
  const mask = getAnimalAvatarCssMaskUrl(props.avatarKey);

  useCssVars(elRef, {
    "--fo-animalAvatar-size": sizeCss,
    "--fo-animalAvatar-src": mask ?? "none"
  });

  return (
    <Box component="span" className="fo-animalAvatar" aria-hidden="true" ref={setRef} />
  );
}
