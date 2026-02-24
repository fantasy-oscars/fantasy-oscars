import { Box, Text, TmdbLogo } from "@ui";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";

export function NomineeTooltipCard(props: {
  unitKind: string;
  categoryName: string;
  filmTitle?: string | null;
  filmYear?: number | null;
  filmPosterUrl?: string | null;
  contributors?: string[];
  performerName?: string | null;
  performerCharacter?: string | null;
  performerProfileUrl?: string | null;
  performerProfilePath?: string | null;
  songTitle?: string | null;
  draftedByLabel?: string | null;
  draftedByAvatarKey?: string | null;
  draftedRoundPick?: string | null;
  action?: React.ReactNode;
}) {
  const {
    unitKind,
    categoryName,
    filmTitle,
    filmYear,
    filmPosterUrl,
    contributors,
    performerName,
    performerCharacter,
    performerProfileUrl,
    performerProfilePath,
    songTitle,
    draftedByLabel,
    draftedByAvatarKey,
    draftedRoundPick,
    action
  } = props;

  const resolvedFilmPosterUrl =
    filmPosterUrl && filmPosterUrl.startsWith("/")
      ? `https://image.tmdb.org/t/p/w342${filmPosterUrl}`
      : filmPosterUrl;

  const resolvedPersonUrl =
    performerProfileUrl && performerProfileUrl.startsWith("/")
      ? `https://image.tmdb.org/t/p/w185${performerProfileUrl}`
      : performerProfileUrl ||
        (performerProfilePath && performerProfilePath.startsWith("/")
          ? `https://image.tmdb.org/t/p/w185${performerProfilePath}`
          : performerProfilePath);

  const hero =
    unitKind === "SONG"
      ? songTitle
        ? `"${songTitle}"`
        : ""
      : unitKind === "PERFORMANCE"
        ? (performerName ?? "")
        : (filmTitle ?? "");
  const support =
    unitKind === "FILM"
      ? filmYear
        ? String(filmYear)
        : null
      : unitKind === "PERFORMANCE"
        ? performerCharacter
          ? `as ${performerCharacter}`
          : null
        : null;

  const secondary =
    unitKind === "FILM"
      ? formatNameList(contributors ?? [])
      : unitKind === "PERFORMANCE"
        ? filmTitle
          ? `${filmTitle}${filmYear ? ` (${filmYear})` : ""}`
          : null
        : null;

  const songLine1 = unitKind === "SONG" ? formatNameList(contributors ?? []) : null;
  const songLine2 =
    unitKind === "SONG" && filmTitle
      ? `${filmTitle}${filmYear ? ` (${filmYear})` : ""}`
      : null;
  const showDraftedChip = Boolean(draftedByLabel && draftedRoundPick);

  return (
    <Box
      className={["fo-tip", showDraftedChip ? "has-draftedChip" : ""]
        .filter(Boolean)
        .join(" ")}
      role="tooltip"
    >
      {showDraftedChip ? (
        <Box
          className="fo-tip-draftedChip"
          aria-label={`Drafted by ${draftedByLabel} ${draftedRoundPick}`}
        >
          <Box className="fo-tip-draftedChipLeft">
            <Box className="fo-tip-draftedChipAvatar" aria-hidden="true">
              <AnimalAvatarIcon avatarKey={draftedByAvatarKey} size="sm" />
            </Box>
            <Text className="fo-tip-draftedChipName" lineClamp={1}>
              {draftedByLabel}
            </Text>
          </Box>
          <Text className="fo-tip-draftedChipPick">{draftedRoundPick}</Text>
        </Box>
      ) : null}

      <Box className="fo-tip-bar fo-tip-header">
        <Text component="span" className="fo-tip-barText">
          {categoryName}
        </Text>
      </Box>

      <Box className="fo-tip-body">
        <Box className="fo-tip-card">
          <Box className="fo-tip-poster" aria-hidden="true">
            {unitKind === "PERFORMANCE" ? (
              resolvedPersonUrl ? (
                <img
                  className="fo-tip-poster-img"
                  src={resolvedPersonUrl}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <Box className="fo-tip-poster-ph" />
              )
            ) : resolvedFilmPosterUrl ? (
              <img
                className="fo-tip-poster-img"
                src={resolvedFilmPosterUrl}
                alt=""
                loading="lazy"
              />
            ) : (
              <Box className="fo-tip-poster-ph" />
            )}
          </Box>

          <Box className="fo-tip-meta">
            <Box className="fo-tip-hero">
              <Text className="fo-tip-name">{hero || "—"}</Text>
              {support ? (
                <Text component="span" className="fo-tip-support">
                  {support}
                </Text>
              ) : null}
            </Box>

            {unitKind === "SONG" ? (
              <>
                {songLine1 ? <Text className="fo-tip-sub">{songLine1}</Text> : null}
                {songLine2 ? <Text className="fo-tip-sub">{songLine2}</Text> : null}
              </>
            ) : secondary ? (
              <Text className="fo-tip-sub">{secondary}</Text>
            ) : null}
          </Box>
        </Box>
      </Box>

      <Box className="fo-tip-bar fo-tip-footer">
        <Text component="span" className="fo-tip-attribution">
          Data provided by TMDB
        </Text>
        <a
          className="fo-tip-tmdbLink"
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noreferrer"
          aria-label="The Movie Database (TMDB)"
        >
          <TmdbLogo className="fo-tip-tmdbLogo" />
        </a>
      </Box>

      {action ? <Box className="fo-tip-action">{action}</Box> : null}
    </Box>
  );
}

function formatNameList(names: string[]) {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}
