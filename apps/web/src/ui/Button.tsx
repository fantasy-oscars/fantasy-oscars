import { Button as MantineButton } from "@mantine/core";
import type { ButtonProps as MantineButtonProps, PolymorphicComponentProps } from "@mantine/core";

// Finite variant vocabulary (semantic first). We currently also accept a small
// subset of Mantine variants for incremental migration.
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "default"
  | "filled"
  | "outline"
  | "subtle"
  | "light"
  | "transparent";

export type ButtonProps = Omit<MantineButtonProps, "variant"> & {
  variant?: ButtonVariant;
};

export function Button<C = "button">(props: PolymorphicComponentProps<C, ButtonProps>) {
  const { variant = "secondary", ...rest } = props;
  // Forward props to Mantine. We cast to the default component type to avoid
  // coupling this wrapper to Mantine's polymorphic generic internals.
  const forwarded = rest as unknown as PolymorphicComponentProps<"button", MantineButtonProps>;

  // Semantic variants only (finite vocabulary). Internals can change without
  // rewriting feature code.
  switch (variant) {
    case "primary":
      return <MantineButton {...forwarded} variant="filled" color="blue" />;
    case "danger":
      return <MantineButton {...forwarded} variant="outline" color="red" />;
    case "ghost":
      return <MantineButton {...forwarded} variant="subtle" color="blue" />;
    case "secondary":
      return <MantineButton {...forwarded} variant="default" color="blue" />;
    // Transitional: allow a small subset of Mantine variants to avoid massive
    // churn while we migrate callsites to semantic variants.
    case "default":
    case "filled":
    case "outline":
    case "subtle":
    case "light":
    case "transparent":
    default:
      return (
        <MantineButton
          {...forwarded}
          variant={variant as MantineButtonProps["variant"]}
        />
      );
  }
}
