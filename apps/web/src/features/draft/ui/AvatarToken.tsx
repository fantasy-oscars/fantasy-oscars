import { Box } from "@ui";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";

export function AvatarToken(props: {
  label: string;
  avatarKey: string;
  active: boolean;
}) {
  return (
    <Box className={["drh-token", props.active ? "is-active" : ""].join(" ")}>
      <AnimalAvatarIcon avatarKey={props.avatarKey} size="draft" />
    </Box>
  );
}
