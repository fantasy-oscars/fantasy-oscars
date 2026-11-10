import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { MobileDraftHeader } from "@/features/draft/screens/mobile/MobileDraftHeader";

afterEach(cleanup);

function renderHeader(
  props: Partial<Parameters<typeof MobileDraftHeader>[0]> & { draftStatus: string }
) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <MobileDraftHeader
          open={false}
          onOpen={() => {}}
          onClose={() => {}}
          backHref="/seasons"
          participants={[]}
          direction="FORWARD"
          roundNumber={1}
          pickNumber={1}
          isTimerDraft={false}
          timerRemainingMs={null}
          clockText="0:00"
          isMyTurn={false}
          audioController={null}
          audioUnlocked={false}
          showDraftControls
          canManageDraft={false}
          onStartDraft={() => {}}
          onPauseDraft={() => {}}
          onResumeDraft={() => {}}
          isFinalResults={false}
          resultsWinnerLabel={null}
          resultsPodium={[]}
          view="draft"
          onViewChange={() => {}}
          canToggleView
          showDrafted={false}
          onToggleShowDrafted={() => {}}
          showDraftedVisible={false}
          userLabel="Alice"
          userAvatarKey={null}
          {...props}
        />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("phone draft header settings menu", () => {
  it("offers Settings when Show drafted applies", () => {
    renderHeader({ draftStatus: "IN_PROGRESS", showDraftedVisible: true });
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("offers Settings when the viewer can start or pause the draft", () => {
    renderHeader({ draftStatus: "IN_PROGRESS", canManageDraft: true });
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("hides Settings when it would be empty and keeps the cell with a hidden spacer", () => {
    const { container } = renderHeader({
      draftStatus: "COMPLETED",
      showDraftControls: false
    });
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    const bar = container.querySelector(".dr-mobileBar");
    const spacer = bar?.lastElementChild;
    expect(spacer?.getAttribute("aria-hidden")).toBe("true");
    expect(spacer?.classList.contains("dr-mobileIconBtn")).toBe(true);
  });
});
