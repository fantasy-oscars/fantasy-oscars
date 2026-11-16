import {
  isCeremonyContentEditable,
  isCeremonyOpenForLeagues
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

export function assertCeremonyOpenForLeagues(status: string) {
  if (!isCeremonyOpenForLeagues(status)) {
    throw new AppError("CEREMONY_NOT_ACTIVE", 409, "Ceremony is not open for leagues", {
      status
    });
  }
}
