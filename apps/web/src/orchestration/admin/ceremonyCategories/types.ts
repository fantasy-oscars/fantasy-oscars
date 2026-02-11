export type IconRow = {
  id: number;
  code: string;
  name?: string | null;
  asset_path?: string | null;
};

export type FamilyRow = {
  id: number;
  code: string;
  name: string;
  default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: number;
  icon_code?: string;
  icon_variant?: "default" | "inverted";
};

export type CategoryRow = {
  id: number;
  family_id: number;
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: number | null;
  sort_index: number;
  family_code: string;
  family_name: string;
  family_default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  family_icon_id: number;
  family_icon_variant?: "default" | "inverted";
  icon_code: string;
  family_icon_code: string;
};

