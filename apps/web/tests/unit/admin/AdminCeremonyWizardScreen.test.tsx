import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MantineProvider } from "@ui";
import {
  AdminCeremonyWizardScreen,
  type WizardStepRow
} from "@/features/admin/screens/ceremonies/AdminCeremonyWizardScreen";

afterEach(cleanup);

const steps: WizardStepRow[] = [
  { id: "initialize", label: "Initialize ceremony", state: "COMPLETE_EDITABLE" },
  { id: "categories", label: "Categories", state: "COMPLETE_LOCKED" },
  { id: "populate", label: "Populate nominees", state: "INCOMPLETE_EDITABLE" },
  { id: "publish", label: "Publish", state: "GATED", reason: "Requires nominees." }
];

function renderWizard(active: number) {
  return render(
    <MantineProvider>
      <AdminCeremonyWizardScreen
        active={active}
        setActive={() => {}}
        stepStates={steps}
        furthestCompleteIndex={1}
        current={steps[active]!}
        content={<p>Step content</p>}
        canGoBack={active > 0}
        canGoNext
        prevIndex={Math.max(0, active - 1)}
        nextIndex={active + 1}
        nextDisabledReason={null}
      />
    </MantineProvider>
  );
}

describe("AdminCeremonyWizardScreen stepper", () => {
  it.each([0, 1, 2])(
    "gives every step one indicator when step %i is current",
    (active) => {
      const { container } = renderWizard(active);
      const rows = [...container.querySelectorAll(".wizard-step")];
      expect(rows).toHaveLength(steps.length);
      for (const row of rows) {
        expect(row.querySelectorAll(".wizard-step-icon")).toHaveLength(1);
      }
      expect(rows.filter((r) => r.classList.contains("is-active"))).toEqual([
        rows[active]
      ]);
    }
  );

  it("draws no second indicator for the current step in the stylesheet", () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../../src/styles.css"),
      "utf8"
    );
    expect(css).not.toMatch(/\.wizard-step[^{]*::?(before|after)/);
  });
});
