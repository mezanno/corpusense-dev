import CanvasNavigation from '@/components/common/CanvasNavigation';
import { useCollectionInspectorContext } from '@/components/reducers/CollectionInspectorContext';

const CollectionNavigation = () => {
  const { handleNext, handlePrevious, hasNextCanvas, hasPreviousCanvas } =
    useCollectionInspectorContext();

  return (
    <CanvasNavigation
      hasPrevious={hasPreviousCanvas()}
      hasNext={hasNextCanvas()}
      onPrevious={handlePrevious}
      onNext={handleNext}
    />
  );
};

export default CollectionNavigation;
