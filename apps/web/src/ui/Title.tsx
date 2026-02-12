import { Title as MantineTitle } from "@mantine/core";
import type { PolymorphicComponentProps, TitleProps as MantineTitleProps } from "@mantine/core";

export type TitleVariant = "brand" | "hero" | "page" | "section" | "card";

export type TitleProps = Omit<MantineTitleProps, "order"> & {
  variant?: TitleVariant;
  order?: MantineTitleProps["order"];
};

function defaultOrderForVariant(v: TitleVariant): MantineTitleProps["order"] {
  switch (v) {
    case "hero":
      return 1;
    case "page":
      return 2;
    case "section":
      return 3;
    case "card":
      return 4;
    case "brand":
    default:
      return 2;
  }
}

export function Title<C = "h2">(props: PolymorphicComponentProps<C, TitleProps>) {
  const { variant = "page", order, ...rest } = props;
  const forwarded = rest as unknown as PolymorphicComponentProps<"h2", MantineTitleProps>;
  return (
    <MantineTitle
      {...forwarded}
      order={order ?? defaultOrderForVariant(variant)}
      data-fo-typo={variant}
    />
  );
}

