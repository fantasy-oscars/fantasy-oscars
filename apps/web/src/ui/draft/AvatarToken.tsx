import { Box } from "@mantine/core";
import { AnimalAvatarIcon } from "../animalAvatarIcon";

export function AvatarToken(props: { label: string; avatarKey: string; active: boolean }) {
  return (
    <Box className={["drh-token", props.active ? "is-active" : ""].join(" ")}>
      <AnimalAvatarIcon avatarKey={props.avatarKey} size={33} />
    </Box>
  );
}
