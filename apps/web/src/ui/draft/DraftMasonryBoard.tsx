import { Box } from "@mantine/core";
import type { RefObject } from "react";
import { CategoryCard } from "./CategoryCard";

export function DraftMasonryBoard(props: {
  midCols: number;
  masonry: Array<
    Array<{
      id: string;
      title: string;
      icon: string;
      iconVariant: "default" | "inverted";
      unitKind: string;
      weightText: string | null;
      nominees: Array<{
        id: string;
        label: string;
        muted: boolean;
        winner: boolean;
        posterUrl: string | null;
        filmTitle: string | null;
        filmYear: number | null;
        contributors: string[];
        songTitle: string | null;
        performerName: string | null;
        performerCharacter: string | null;
        performerProfileUrl: string | null;
        performerProfilePath: string | null;
      }>;
    }>
  >;
  keyboardCategoryId: string | null;
  setKeyboardCategoryId: (categoryId: string | null) => void;
  firstPillRefByCategoryId?: Record<string, RefObject<HTMLButtonElement | null> | undefined>;
  canDraftAction: boolean;
  onNomineeClick: (nominationId: number, label: string) => void;
  onNomineeDoubleClick: (nominationId: number) => void;
}) {
  return (
    <Box className="dr-middle" role="region" aria-label="Draft board" tabIndex={0}>
      <Box className="dr-middle-columns" aria-hidden="true">
        {Array.from({ length: props.midCols }, (_, idx) => (
          <Box key={`mid-col-${idx}`} className="dr-mid-col" />
        ))}
      </Box>

      <Box className="dr-masonry">
        {props.masonry.map((col, colIdx) => (
          <Box key={`col-${colIdx}`} className="dr-masonry-col">
            {col.map((b) => (
              <CategoryCard
                key={b.id}
                categoryId={b.id}
                title={b.title}
                icon={b.icon}
                iconVariant={b.iconVariant}
                unitKind={b.unitKind}
                weightText={b.weightText}
                nominees={b.nominees}
                firstPillRef={props.firstPillRefByCategoryId?.[b.id] ?? null}
                isKeyboardMode={props.keyboardCategoryId === b.id}
                setKeyboardMode={props.setKeyboardCategoryId}
                canDraftAction={props.canDraftAction}
                onNomineeClick={props.onNomineeClick}
                onNomineeDoubleClick={props.onNomineeDoubleClick}
              />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
