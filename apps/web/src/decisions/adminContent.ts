export type StaticKey =
  | "about"
  | "faq"
  | "how_it_works"
  | "landing_blurb"
  | "code_of_conduct"
  | "legal_terms"
  | "legal_privacy"
  | "legal_disclaimer";

export const STATIC_META: Record<StaticKey, { label: string; hint: string }> = {
  landing_blurb: {
    label: "Hero",
    hint: "The hero card at the top of the Home page (title + tagline)."
  },
  about: {
    label: "About",
    hint: "Single-page site content shown under About."
  },
  faq: {
    label: "FAQ",
    hint: "Single-page site content shown under FAQ."
  },
  how_it_works: {
    label: "How It Works",
    hint: "Single-page site content shown under How It Works."
  },
  code_of_conduct: {
    label: "Code of Conduct",
    hint: "Legal page shown under Code of Conduct."
  },
  legal_terms: {
    label: "Terms",
    hint: "Legal page shown under Terms."
  },
  legal_privacy: {
    label: "Privacy",
    hint: "Legal page shown under Privacy."
  },
  legal_disclaimer: {
    label: "Disclaimer",
    hint: "Legal page shown under Disclaimer."
  }
};

export type DynamicKey = "banner" | "home_main";

export const DYNAMIC_META: Record<DynamicKey, { label: string; hint: string }> = {
  home_main: {
    label: "Home main body",
    hint: "Exactly one entry is shown on the landing page at a time."
  },
  banner: {
    label: "Banner messages",
    hint: "Multiple banners may be shown at the same time."
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
