import { Text as MantineText } from "@mantine/core";
import type {
  TextProps as MantineTextProps,
  PolymorphicComponentProps
} from "@mantine/core";

export type TextVariant =
  | "body"
  | "meta"
  | "helper"
  | "muted"
  | "danger"
  | "success"
  // Chrome-specific (header/footer). Keep these rare and intentional.
  | "chromeHeading"
  | "chromeFineprint";

export type TextProps = Omit<MantineTextProps, "variant"> & {
  // Semantic typography role. This is the only supported way to express
  // typography differences in feature code.
  variant?: TextVariant;
};

export function Text<C = "p">(props: PolymorphicComponentProps<C, TextProps>) {
  const { variant = "body", ...rest } = props;
  const forwarded = rest as unknown as PolymorphicComponentProps<"p", MantineTextProps>;
  return <MantineText {...forwarded} data-fo-typo={variant} />;
}
