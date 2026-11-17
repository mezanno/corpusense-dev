import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  /** Titre visible de la page (clé i18n déjà traduite par l'appelant). */
  title: string;
  /** Icône de la page, alignée sur celle de la barre latérale. */
  icon?: LucideIcon;
  /** Actions globales de la page (boutons…), alignées à droite. */
  actions?: ReactNode;
  className?: string;
};

/**
 * En-tête structurel commun à toutes les pages : un seul `h1` visible,
 * typographie et espacements identiques partout (lot 9 du plan UI cohérence).
 */
const PageHeader = ({ title, icon: Icon, actions, className }: PageHeaderProps) => (
  <header className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}>
    {Icon !== undefined && <Icon aria-hidden='true' />}
    <h1 className='text-2xl font-bold'>{title}</h1>
    {actions !== undefined && (
      <div className='ml-auto flex flex-wrap items-center gap-2'>{actions}</div>
    )}
  </header>
);

export default PageHeader;
