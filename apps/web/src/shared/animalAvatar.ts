const avatarUrls = import.meta.glob("../assets/openmoji/animals/*.svg", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const avatarByKey: Record<string, string> = Object.fromEntries(
  Object.entries(avatarUrls).map(([path, url]) => {
    const file = path.split("/").pop() ?? "";
    const key = file.replace(/\.svg$/i, "");
    return [key, url];
  })
);

export function getAnimalAvatarUrl(key: string | null | undefined): string | null {
  const normalized = key ?? "monkey";
  return avatarByKey[normalized] ?? avatarByKey.monkey ?? null;
}

export function getAnimalAvatarCssMaskUrl(key: string | null | undefined): string | null {
  const url = getAnimalAvatarUrl(key);
  // Wrap to avoid quoting issues when used in inline style.
  return url ? `url("${url}")` : null;
}
