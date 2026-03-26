import { Manifest } from '@iiif/presentation-3';

export type SourceType = 'local' | 'remote';

export interface StoredBlob {
  id: string;
  blob: Blob;
}

export interface Source {
  id: string;
  name: string;
  type: SourceType;

  pageCount: number;
  thumbnailBlobId: string;
}

export type SourceContent =
  | {
      id: string;
      type: 'remote';
      manifest: Manifest;
    }
  | {
      id: string;
      type: 'local';
      manifest: Manifest;
      localFile: {
        outputDirectoryHandle: FileSystemDirectoryHandle;
        timestamp: number;
        manifestName: string;
        folderName: string;
      };
    };

export type SourceWithContent = Source & {
  content: SourceContent;
};

export type AddSourceDTO =
  | {
      type: 'remote';
      name: string;
      pageCount: number;
      thumbnailBlob: Blob;
      manifest: Manifest;
    }
  | {
      type: 'local';
      name: string;
      pageCount: number;
      thumbnailBlob: Blob;
      manifest: Manifest;
      localFile: {
        outputDirectoryHandle: FileSystemDirectoryHandle;
        timestamp: number;
        manifestName: string;
        folderName: string;
      };
    };
