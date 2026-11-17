import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';

type DocIndex = { slug: string; title: string }[];

export default function DocsSidebar() {
  const { t } = useTranslation();
  const [pages, setPages] = useState<DocIndex>([]);

  useEffect(() => {
    let active = true;
    const loadDocIndex = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}doc/index.json`);
        if (!response.ok) {
          if (active) toast.error(t('error_loading_documentation_index'));
          return;
        }
        const data = (await response.json()) as DocIndex;

        if (active) setPages(data);
      } catch {
        if (active) toast.error(t('error_loading_documentation_index'));
      }
    };
    void loadDocIndex();
    return () => {
      active = false;
    };
  }, [t]);

  return (
    <aside className='sticky top-0 h-full w-64 shrink-0 overflow-y-auto border-r bg-primary p-4'>
      <h2 className='mb-4 font-bold text-foreground'>{t('page_title_documentation')}</h2>
      <ul className='space-y-2'>
        {pages.map((p) => (
          <li key={p.slug}>
            <NavLink
              to={`/doc/${p.slug}`}
              className={({ isActive }) =>
                `block rounded-md px-2 py-1 hover:bg-accent ${
                  isActive ? 'bg-accent font-semibold' : ''
                }`
              }
            >
              {p.title}
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  );
}
