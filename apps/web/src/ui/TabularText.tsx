/**
 * Renders a string with every digit in its own fixed-width cell, so a clock never shifts
 * the text beside it, even in fonts without tabular figures. Only digits are wrapped.
 */
export function TabularText(props: { text: string; className?: string }) {
  const parts = props.text.split(/(\d)/).filter((part) => part !== "");
  return (
    <span className={props.className}>
      {parts.map((part, index) =>
        /^\d$/.test(part) ? (
          <span key={index} className="dr-digit">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
}
