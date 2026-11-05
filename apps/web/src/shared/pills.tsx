import { Box } from "@ui";
import type { StatusMark, StatusTone } from "@/decisions/statusTone";

const MARK_GLYPH = { pause: "pause", check: "check" } as const;

export function StatusPill(props: {
  tone?: StatusTone;
  mark?: StatusMark;
  children: React.ReactNode;
}) {
  const { tone = "neutral", mark = null, children } = props;
  return (
    <Box component="span" className="fo-chip" data-tone={tone}>
      {mark === "dot" ? <span className="fo-chip__dot" aria-hidden="true" /> : null}
      {mark === "pause" || mark === "check" ? (
        <span className="mi-icon mi-icon-tiny fo-chip__mark" aria-hidden="true">
          {MARK_GLYPH[mark]}
        </span>
      ) : null}
      <span className="fo-chip__label">{children}</span>
    </Box>
  );
}

export function CommissionerPill() {
  return <StatusPill>Commissioner</StatusPill>;
}

export function WinnerChip() {
  return (
    <Box component="span" className="fo-chip fo-chip--winner">
      <span className="mi-icon mi-icon-tiny fo-chip__mark" aria-hidden="true">
        emoji_events
      </span>
      <span className="fo-chip__label">Winner</span>
    </Box>
  );
}
