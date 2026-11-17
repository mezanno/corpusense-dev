import AsyncState from '@/components/common/AsyncState';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import useModifierChainLive from '@/hooks/data/modifiers/useModifierChainLive';
import { useTranslation } from 'react-i18next';
import { ModifierChainCard } from './ModifierChainCard';

const ModifierChainDashboard = ({
  selectedChainId,
  setSelectedChainId,
}: {
  selectedChainId: string | null;
  setSelectedChainId: (id: string | null) => void;
}) => {
  const { t } = useTranslation();
  const { modifierChains, isLoading } = useModifierChainLive();

  return (
    <ScrollArea className='space-y-1'>
      <div className='flex space-x-2'>
        <AsyncState
          isLoading={isLoading}
          isEmpty={modifierChains.length === 0}
          emptyMessage={t('info_no_modifier_chains')}
        >
          {modifierChains.map((chain) => (
            <ModifierChainCard
              key={chain.id}
              chain={chain}
              setSelectedChainId={setSelectedChainId}
              selectedChainId={selectedChainId}
            />
          ))}
        </AsyncState>
      </div>
      <ScrollBar orientation='horizontal' />
    </ScrollArea>
  );
};

export default ModifierChainDashboard;
