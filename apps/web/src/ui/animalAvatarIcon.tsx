import { Box } from "@mantine/core";
import { getAnimalAvatarCssMaskUrl } from "./animalAvatar";

export function AnimalAvatarIcon(props: { avatarKey?: string | null; size?: number }) {
  const size = props.size ?? 22;
  const mask = getAnimalAvatarCssMaskUrl(props.avatarKey);

  return (
    <Box
      component="span"
      className="fo-animalAvatar"
      aria-hidden="true"
      style={
        {
          ["--fo-animalAvatar-size" as never]: `${size}px`,
          ["--fo-animalAvatar-src" as never]: mask ?? "none"
        } as React.CSSProperties
      }
    />
  );
}
