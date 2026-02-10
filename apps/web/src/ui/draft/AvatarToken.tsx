import { Box } from "@mantine/core";
import { AnimalAvatarIcon } from "../animalAvatarIcon";
import { pickDeterministicAvatarKey } from "../../decisions/avatars";

export function AvatarToken(props: { label: string; avatarKey: string | null; active: boolean }) {
  const avatarKey = props.avatarKey ?? pickDeterministicAvatarKey(props.label);
  return (
    <Box className={["drh-token", props.active ? "is-active" : ""].join(" ")}>
      <AnimalAvatarIcon avatarKey={avatarKey} size={33} />
    </Box>
  );
}

