import { Box, Text, UnstyledButton } from "@ui";
import { NomineePill } from "@/features/draft/ui/NomineePill";

export type DraftBoardGridCategory = {
  id: number;
  title: string;
  icon: string;
  nominations: Array<{ id: number; label: string; muted: boolean; selected: boolean }>;
  emptyText: string | null;
};

export function DraftBoardGrid(props: {
  categories: DraftBoardGridCategory[];
  onSelectNomination?: (id: number) => void;
  selectable?: boolean;
}) {
  const { categories, onSelectNomination } = props;
  const selectable = props.selectable ?? Boolean(onSelectNomination);

  return (
    <Box className="draft-board">
      <Box className="category-columns">
        {categories.map((c) => (
          <Box
            key={c.id}
            className={`category-card ${c.nominations.length ? "" : "empty"}`}
          >
            <Box className="category-header">
              <Text className="category-title">{c.title}</Text>
              <Text className="category-count muted" size="sm">
                {c.nominations.length}
              </Text>
            </Box>
            <Box className="category-body">
              {c.emptyText ? (
                <Text className="muted small" size="sm">
                  {c.emptyText}
                </Text>
              ) : (
                c.nominations.map((n) => {
                  const state = n.selected ? "active" : n.muted ? "picked" : "default";
                  const pill = (
                    <NomineePill label={n.label} icon={c.icon} state={state} />
                  );

                  return selectable ? (
                    <UnstyledButton
                      key={n.id}
                      type="button"
                      className="nominee-line"
                      onClick={() => onSelectNomination?.(n.id)}
                      title={n.label}
                    >
                      {pill}
                    </UnstyledButton>
                  ) : (
                    <Box key={n.id} className="nominee-line" title={n.label}>
                      {pill}
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
