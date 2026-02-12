import { ActionIcon as MantineActionIcon } from "@mantine/core";
import type {
  ActionIconProps as MantineActionIconProps,
  PolymorphicComponentProps
} from "@mantine/core";

// Finite variant vocabulary (semantic first). We also accept a small subset of
// Mantine variants during migration.
export type ActionIconVariant =
  | "ghost"
  | "secondary"
  | "danger"
  | "default"
  | "subtle"
  | "filled"
  | "outline"
  | "transparent"
  | "light";

export type ActionIconProps = Omit<MantineActionIconProps, "variant"> & {
  variant?: ActionIconVariant;
};

export function ActionIcon<C = "button">(
  props: PolymorphicComponentProps<C, ActionIconProps>
) {
  const { variant = "ghost", ...rest } = props;
  const forwarded =
    rest as unknown as PolymorphicComponentProps<"button", MantineActionIconProps>;

  switch (variant) {
    case "danger":
      return <MantineActionIcon {...forwarded} variant="subtle" color="red" />;
    case "secondary":
      return <MantineActionIcon {...forwarded} variant="default" color="blue" />;
    case "ghost":
    default:
      // Transitional: allow a small subset of Mantine variants without forcing
      // churn in feature code.
      if (
        variant === "default" ||
        variant === "subtle" ||
        variant === "filled" ||
        variant === "outline" ||
        variant === "transparent" ||
        variant === "light"
      ) {
        return (
          <MantineActionIcon
            {...forwarded}
            variant={variant as MantineActionIconProps["variant"]}
          />
        );
      }

      return <MantineActionIcon {...forwarded} variant="subtle" color="blue" />;
  }
}
