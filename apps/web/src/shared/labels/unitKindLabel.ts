export function unitKindLabel(kind: "FILM" | "SONG" | "PERFORMANCE") {
  switch (kind) {
    case "FILM":
      return "Film";
    case "SONG":
      return "Song + Film";
    case "PERFORMANCE":
      return "Person + Film";
  }
}
