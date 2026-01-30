export type StaticKey =
  | "about"
  | "faq"
  | "landing_blurb"
  | "code_of_conduct"
  | "legal_terms"
  | "legal_privacy";

export const STATIC_META: Record<StaticKey, { label: string; hint: string }> = {
  landing_blurb: {
    label: "Landing Page Blurb",
    hint: "Live immediately. Keep it short and punchy."
  },
  about: {
    label: "About",
    hint: "Live immediately. Shown at /about."
  },
  faq: {
    label: "FAQ",
    hint: "Live immediately. Shown at /faq."
  },
  code_of_conduct: {
    label: "Code of Conduct",
    hint: "Live immediately. Shown at /code-of-conduct."
  },
  legal_terms: {
    label: "Terms",
    hint: "Live immediately. Shown at /terms."
  },
  legal_privacy: {
    label: "Privacy",
    hint: "Live immediately. Shown at /privacy."
  }
};

export type DynamicKey = "banner" | "home_main";

export const DYNAMIC_META: Record<DynamicKey, { label: string; hint: string }> = {
  home_main: {
    label: "Home Main Body",
    hint: "Long-form content shown on the landing page."
  },
  banner: {
    label: "Banner",
    hint: "Short message shown prominently in-app."
  }
};

export function formatDateTimeForHumans(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function formatSchedule(startsAt?: string | null, endsAt?: string | null) {
  const s = startsAt ? formatDateTimeForHumans(startsAt) : null;
  const e = endsAt ? formatDateTimeForHumans(endsAt) : null;
  if (s && e) return `${s} – ${e}`;
  if (s) return `Starts ${s}`;
  if (e) return `Ends ${e}`;
  return null;
}

export function isoToLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
