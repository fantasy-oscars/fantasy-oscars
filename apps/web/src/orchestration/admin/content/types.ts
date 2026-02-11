export type CmsDynamicRow = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  status: "DRAFT" | "PUBLISHED";
  variant?: "info" | "warning" | "success" | "error";
  dismissible?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

