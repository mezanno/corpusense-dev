import { ConvertedFile } from '@/data/models/ConvertedFile';
import { getConvertedFileRepository } from '@/data/repositories/indexeddb/dbFactory';
import { Octokit } from '@octokit/rest';

export const GITHUB_TOKEN_STORAGE_KEY = 'github_token';
const GITHUB_RAW_BASE_URL = 'https://raw.githubusercontent.com';

const useRepository = () => {
  const getToken = (): string | null => {
    return localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY);
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  };

  const textToBase64 = (text: string): string => {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  };

  const updateManifestImageUrls = (
    manifestContent: string,
    owner: string,
    repo: string,
    folder: string,
  ): string => {
    const rawBaseUrl = `${GITHUB_RAW_BASE_URL}/${owner}/${repo}/main`;
    return manifestContent.replace(new RegExp(`"(${folder}/[^"]+)"`, 'g'), `"${rawBaseUrl}/$1"`);
  };

  const uploadDirectoryContents = async (
    octokit: Octokit,
    handle: FileSystemDirectoryHandle,
    owner: string,
    repo: string,
    skipFileName: string,
    basePath = '',
  ): Promise<void> => {
    for await (const [name, entry] of handle.entries()) {
      const entryPath = basePath ? `${basePath}/${name}` : name;
      if (entry.kind === 'file') {
        if (name === skipFileName) continue;
        const fileHandle = entry as FileSystemFileHandle;
        const fileObj = await fileHandle.getFile();
        const content = await fileToBase64(fileObj);
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: entryPath,
          message: `Add ${entryPath}`,
          content,
        });
      } else if (entry.kind === 'directory') {
        await uploadDirectoryContents(
          octokit,
          entry as FileSystemDirectoryHandle,
          owner,
          repo,
          skipFileName,
          entryPath,
        );
      }
    }
  };

  const uploadToRepository = async (file: ConvertedFile, repositoryName: string): Promise<void> => {
    const token = getToken();
    if (token === null || token.trim().length === 0) {
      throw new Error('GitHub token not configured');
    }

    const handle = file.outputDirectoryHandle;
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      throw new Error('No permission to read the output directory');
    }

    const octokit = new Octokit({ auth: token });

    const { data: newRepo } = await octokit.rest.repos.createForAuthenticatedUser({
      name: repositoryName,
      private: false,
      auto_init: false,
    });

    const folderName = handle.name;

    // Upload all files except the manifest first
    await uploadDirectoryContents(
      octokit,
      handle,
      newRepo.owner.login,
      newRepo.name,
      file.manifestName,
      folderName,
    );

    // Read the manifest, replace image paths with GitHub raw URLs, then upload it last
    const manifestFileHandle = await handle.getFileHandle(file.manifestName);
    const manifestFile = await manifestFileHandle.getFile();
    const manifestContent = await manifestFile.text();
    const updatedManifest = updateManifestImageUrls(
      manifestContent,
      newRepo.owner.login,
      newRepo.name,
      folderName,
    );

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: newRepo.owner.login,
      repo: newRepo.name,
      path: `${folderName}/${file.manifestName}`,
      message: `Add ${folderName}/${file.manifestName}`,
      content: textToBase64(updatedManifest),
    });

    const githubManifestUrl = `${GITHUB_RAW_BASE_URL}/${newRepo.owner.login}/${newRepo.name}/main/${folderName}/${file.manifestName}`;
    console.log('Manifest uploaded to:', githubManifestUrl);
    const convertedFileRepository = getConvertedFileRepository();
    await convertedFileRepository.update(file.id, { githubManifestUrl });
  };

  const nameAlreadyExists = (name: string): boolean => {
    console.log(name);
    return false;
  };

  return {
    uploadToRepository,
    nameAlreadyExists,
  };
};

export default useRepository;
