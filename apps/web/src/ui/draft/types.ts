export type DraftNomineeMeta = {
  unitKind: string;
  categoryName: string;
  filmTitle: string | null;
  filmYear: number | null;
  filmPosterUrl: string | null;
  contributors: string[];
  performerName: string | null;
  performerCharacter: string | null;
  performerProfileUrl: string | null;
  performerProfilePath: string | null;
  songTitle: string | null;
  categoryIcon: string;
  categoryIconVariant: "default" | "inverted";
};

export type DraftLedgerRow = {
  pickNumber: number;
  roundPick: string;
  seatNumber: number | null;
  seatLabel: string;
  nominationId: number | null;
  label: string;
  icon?: string | null;
  active?: boolean;
  winner?: boolean;
};

export type DraftRosterPick = {
  pickNumber: number;
  roundPick: string;
  nominationId: number;
  label: string;
  icon?: string | null;
  winner?: boolean;
};

export type AutoDraftPlan = { id: number; name: string };

export type AutoDraftListItem = { nominationId: number; label: string; icon?: string | null };

export type AutoDraftStrategy =
  | "random"
  | "by_category"
  | "alphabetical"
  | "wisdom"
  | "custom";

export type AutoDraftState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  strategy: AutoDraftStrategy;
  setStrategy: (strategy: AutoDraftStrategy) => void;
  plans: AutoDraftPlan[];
  selectedPlanId: number | null;
  setSelectedPlanId: (planId: number | null) => void;
  // The resolved current ordering list (strategy-dependent).
  list: AutoDraftListItem[];
};

