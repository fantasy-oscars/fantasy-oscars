import {
  isCeremonyContentEditable,
  isCeremonyOpenForLeagues,
  isCeremonyOpenForSeasons
} from "@fantasy-oscars/shared";
import { AppError } from "../errors.js";

export function assertCeremonyContentEditable(status: string) {
  if (!isCeremonyContentEditable(status)) {
    throw new AppError(
      "CEREMONY_CONTENT_LOCKED",
      409,
      "Categories and nominations can only be edited before the ceremony opens for leagues",
      { status }
    );
  }
}

/** Draft start: the ceremony must be open for leagues. */
export function assertCeremonyOpenForLeagues(status: string) {
  if (!isCeremonyOpenForLeagues(status)) {
    throw new AppError(
      "CEREMONY_NOT_ACTIVE",
      409,
      "This ceremony isn't open yet. You can start the draft once it is.",
      { status }
    );
  }
}

/** Season create paths: the ceremony must be published or open for leagues. */
export function assertCeremonyOpenForSeasons(status: string) {
  if (!isCeremonyOpenForSeasons(status)) {
    throw new AppError("CEREMONY_NOT_ACTIVE", 409, "Ceremony is not open for leagues", {
      status
    });
  }
}
