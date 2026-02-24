import { ANIMAL_AVATAR_KEYS } from "@fantasy-oscars/shared";

export function pickDeterministicAvatarKey(label: string): string {
  // Stable, non-color-dependent identity: map the handle to an animal key.
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return ANIMAL_AVATAR_KEYS[hash % ANIMAL_AVATAR_KEYS.length] ?? "monkey";
}
