import Loading from '@/components/common/Loading';
import NothingToShow from '@/components/common/NothingToShow';
import type { ReactNode } from 'react';

const AsyncState = ({
  isLoading,
  isEmpty,
  emptyMessage,
  children,
}: {
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) => {
  if (isLoading) return <Loading />;
  if (isEmpty) return <NothingToShow message={emptyMessage} />;
  return children;
};

export default AsyncState;
