import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.fn();
vi.mock("@/notifications", () => ({ confirm: (req: unknown) => confirmMock(req) }));

const { confirmHomeReplacement } =
  await import("@/app/pages/admin/content/confirmHomeReplacement");

beforeEach(() => confirmMock.mockReset());

describe("confirmHomeReplacement", () => {
  it("publishes without asking when nothing is replaced", async () => {
    await expect(confirmHomeReplacement(null)).resolves.toBe(true);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("asks before replacing the published Home entry and passes on the answer", async () => {
    confirmMock.mockResolvedValue(false);
    await expect(confirmHomeReplacement({ title: "Live update" })).resolves.toBe(false);
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Replace the Home announcement?",
        message: expect.stringContaining('"Live update"'),
        confirmLabel: "Publish"
      })
    );
  });
});
