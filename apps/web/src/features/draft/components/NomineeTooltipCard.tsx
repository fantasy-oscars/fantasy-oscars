import { Box, Text, TmdbLogo } from "@ui";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";

export function NomineeTooltipCard(props: {
  unitKind: string;
  categoryName: string;
  filmTitle?: string | null;
  filmYear?: number | null;
  filmPosterUrl?: string | null;
  contributors?: string[];
  performerContributors?: Array<{
    fullName: string;
    roleLabel: string | null;
    profileUrl: string | null;
    profilePath: string | null;
    sortOrder: number;
  }>;
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
    performerContributors,
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

  const normalizedPerformerContributors = (performerContributors ?? [])
    .map((c, idx) => ({
      fullName: String(c.fullName ?? "").trim(),
      roleLabel: c.roleLabel ?? null,
      profileUrl: resolveTmdbImageUrl(
        c.profileUrl ?? null,
        c.profilePath ?? null,
        "w185"
      ),
      sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : idx + 1
    }))
    .filter((c) => Boolean(c.fullName))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const fallbackPerformerContributor =
    performerName && performerName.trim()
      ? [
          {
            fullName: performerName.trim(),
            roleLabel: performerCharacter ?? null,
            profileUrl: resolveTmdbImageUrl(
              performerProfileUrl ?? null,
              performerProfilePath ?? null,
              "w185"
            ),
            sortOrder: 1
          }
        ]
      : [];

  const namedContributors = (contributors ?? [])
    .map((name, idx) => ({
      fullName: String(name ?? "").trim(),
      roleLabel: null,
      profileUrl: null,
      sortOrder: idx + 1
    }))
    .filter((c) => Boolean(c.fullName));

  const performanceContributors =
    unitKind === "PERFORMANCE"
      ? normalizedPerformerContributors.length > 0
        ? normalizedPerformerContributors
        : fallbackPerformerContributor.length > 0
          ? fallbackPerformerContributor
          : namedContributors
      : [];
  const isSinglePerformance = performanceContributors.length === 1;
  const singlePerformanceContributor = isSinglePerformance
    ? performanceContributors[0]
    : null;
  const hero =
    unitKind === "SONG"
      ? songTitle
        ? `"${songTitle}"`
        : ""
      : unitKind === "PERFORMANCE"
        ? (performanceContributors[0]?.fullName ?? performerName ?? "")
        : (filmTitle ?? "");
  const support =
    unitKind === "FILM"
      ? filmYear
        ? String(filmYear)
        : null
      : unitKind === "PERFORMANCE"
        ? performanceContributors.length <= 1 && performerCharacter
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
  const performanceFilmLine =
    filmTitle && filmYear ? `${filmTitle} (${filmYear})` : (filmTitle ?? null);

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
        {unitKind === "PERFORMANCE" && performanceContributors.length > 1 ? (
          <Box className="fo-tip-performanceList">
            {performanceContributors.map((c, idx) => {
              const mediaSrc = c.profileUrl ?? (idx === 0 ? resolvedFilmPosterUrl : null);
              return (
                <Box key={`${c.fullName}-${idx}`} className="fo-tip-performanceCard">
                  <Box className="fo-tip-poster" aria-hidden="true">
                    {mediaSrc ? (
                      <img
                        className="fo-tip-poster-img"
                        src={mediaSrc}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <Box className="fo-tip-poster-ph" />
                    )}
                  </Box>
                  <Box className="fo-tip-meta">
                    {idx === 0 && performanceFilmLine ? (
                      <Text className="fo-tip-filmLine">{performanceFilmLine}</Text>
                    ) : null}
                    <Text className="fo-tip-name">{c.fullName || "—"}</Text>
                    {c.roleLabel ? (
                      <Text className="fo-tip-sub">as {c.roleLabel}</Text>
                    ) : null}
                  </Box>
                </Box>
              );
            })}
          </Box>
        ) : unitKind === "PERFORMANCE" && singlePerformanceContributor ? (
          <Box className="fo-tip-card">
            <Box className="fo-tip-poster" aria-hidden="true">
              {singlePerformanceContributor.profileUrl || resolvedFilmPosterUrl ? (
                <img
                  className="fo-tip-poster-img"
                  src={
                    singlePerformanceContributor.profileUrl ?? resolvedFilmPosterUrl ?? ""
                  }
                  alt=""
                  loading="lazy"
                />
              ) : (
                <Box className="fo-tip-poster-ph" />
              )}
            </Box>

            <Box className="fo-tip-meta">
              <Text className="fo-tip-name">
                {singlePerformanceContributor.fullName || "—"}
              </Text>
              {singlePerformanceContributor.roleLabel ? (
                <Text className="fo-tip-sub">
                  as {singlePerformanceContributor.roleLabel}
                </Text>
              ) : null}
              {performanceFilmLine ? (
                <Text className="fo-tip-filmLine">{performanceFilmLine}</Text>
              ) : null}
            </Box>
          </Box>
        ) : (
          <Box className="fo-tip-card">
            <Box className="fo-tip-poster" aria-hidden="true">
              {unitKind === "PERFORMANCE" ? (
                resolvedFilmPosterUrl ? (
                  <img
                    className="fo-tip-poster-img"
                    src={resolvedFilmPosterUrl}
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
        )}
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

function resolveTmdbImageUrl(
  explicitUrl: string | null,
  path: string | null,
  size: "w92" | "w154" | "w185" | "h632"
) {
  if (explicitUrl && explicitUrl.startsWith("/")) {
    return `https://image.tmdb.org/t/p/${size}${explicitUrl}`;
  }
  if (explicitUrl) return explicitUrl;
  if (path && path.startsWith("/")) {
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }
  return path;
}

function formatNameList(names: string[]) {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}
