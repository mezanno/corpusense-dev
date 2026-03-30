import { useFSHandleStore } from '@/state/zustand/useFSHandleStore';

const useConvertedFileIO = () => {
  // const appDispatch = useAppDispatch();
  // const convertedFilesRepository = useMemo(() => getConvertedFileRepository(), []);
  const { addDirectoryHandle } = useFSHandleStore();

  // const loadManifest = useCallback(async (id: string) => {
  //   try {
  //     const convertedFile = await convertedFilesRepository.getById(id);
  //     const handle = convertedFile.outputDirectoryHandle;
  //     const perm = await handle.queryPermission({ mode: 'read' });
  //     if (perm !== 'granted') {
  //       throw new Error('No permission to read the manifest directory');
  //     }

  //     const manifestFileHandle = await handle.getFileHandle(convertedFile.manifestName);
  //     const manifestFile = await manifestFileHandle.getFile();
  //     const manifestText = await manifestFile.text();
  //     appDispatch(fecthManifestRequest(manifestText));
  //   } catch (e) {
  //     console.error(e);
  //   }
  // }, []);

  const requestPermission = async () => {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await addDirectoryHandle(handle);
  };

  return {
    // loadManifest,
    requestPermission,
  };
};

export default useConvertedFileIO;
