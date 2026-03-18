export type Project = {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  sources: string[]; // Array of source IDs (could be IIIF manifests or local files)
  collections: string[]; // Array of collection IDs
};
