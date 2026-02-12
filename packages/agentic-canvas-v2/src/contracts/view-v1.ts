export const VIEW_V1_SCHEMA_VERSION = "v1" as const;

export const REQUIRED_V1_SECTION_IDS = [
  "mission",
  "priorities",
  "evidence",
  "quick_reaction",
] as const;

export type V1SectionId = (typeof REQUIRED_V1_SECTION_IDS)[number];

export interface MorningBriefV1Section {
  id: V1SectionId;
  title: string;
  body: string;
}

export interface MorningBriefViewV1 {
  schema_version: typeof VIEW_V1_SCHEMA_VERSION;
  source_schema_version: "v0.2";
  generated_at: string;
  sections: MorningBriefV1Section[];
}
