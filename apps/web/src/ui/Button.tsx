import { Button as MantineButton } from "@mantine/core";
import type {
  ButtonProps as MantineButtonProps,
  PolymorphicComponentProps
} from "@mantine/core";

// Finite variant vocabulary (semantic first). We currently also accept a small
// subset of Mantine variants for incremental migration.
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "default"
  | "filled"
  | "outline"
  | "subtle"
  | "light"
  | "transparent";

export type ButtonProps = Omit<MantineButtonProps, "variant"> & {
  variant?: ButtonVariant;
};

// Semantic variants map to Mantine variants for structure; the skin in
// styles.css keys on `data-fo-variant`, because Mantine's `color` is not
// readable from CSS.
type MantineMapping = {
  variant: MantineButtonProps["variant"];
  color?: string;
  semantic: string;
};

function mapVariant(variant: ButtonVariant): MantineMapping {
  switch (variant) {
    case "primary":
    case "filled":
      return { variant: "filled", color: "blue", semantic: "primary" };
    case "danger":
      return { variant: "outline", color: "red", semantic: "danger" };
    case "destructive":
      return { variant: "filled", color: "red", semantic: "destructive" };
    case "ghost":
    case "subtle":
    case "transparent":
      return {
        variant: variant === "ghost" ? "subtle" : variant,
        color: variant === "ghost" ? "blue" : undefined,
        semantic: "ghost"
      };
    case "secondary":
      return { variant: "default", color: "blue", semantic: "secondary" };
    case "default":
    case "outline":
    case "light":
    default:
      return { variant: variant as MantineButtonProps["variant"], semantic: "secondary" };
  }
}

export function Button<C = "button">(props: PolymorphicComponentProps<C, ButtonProps>) {
  const { variant = "secondary", ...rest } = props;
  // Forward props to Mantine. We cast to the default component type to avoid
  // coupling this wrapper to Mantine's polymorphic generic internals.
  const forwarded = rest as unknown as PolymorphicComponentProps<
    "button",
    MantineButtonProps
  >;
  const mapped = mapVariant(variant);
  const colorProps = mapped.color ? { color: mapped.color } : {};

  return (
    <MantineButton
      {...forwarded}
      {...colorProps}
      variant={mapped.variant}
      data-fo-variant={mapped.semantic}
      aria-busy={forwarded.loading ? true : undefined}
    />
  );
}
