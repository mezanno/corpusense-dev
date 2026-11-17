import NothingToShow from '@/components/common/NothingToShow';
import DocsSidebar from '@/components/features/documentation/DocSideBar';
import { ScrollArea } from '@/components/ui/scroll-area';
import useReducedMotion from '@/hooks/ui/useReducedMotion';
import GithubSlugger from 'github-slugger';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useParams } from 'react-router-dom';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

// extrait les h1/h2/h3 pour le sommaire
const extractHeadings = (md: string) => {
  const regex = /^(#{1,3})\s+(.*)$/gm;
  const matches = [];
  let match;
  /*
  GithubSlugger permet de créer des id compatibles avec GitHub (espaces remplacés par des tirets, minuscules, etc.)
  Il s'agit du même système que celui utilisé par rehypeSlug pour générer les id dans le contenu Markdown.
  --> Ainsi, les liens du sommaire correspondent aux id des titres dans le contenu.
  */
  const slugger = new GithubSlugger();
  while ((match = regex.exec(md)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const slug = slugger.slug(text);
    matches.push({ level, text, slug });
  }
  return matches;
};

const DocumentationPage = () => {
  const { page } = useParams(); // ex: 'howto'
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [content, setContent] = useState<string | null>(null);
  const [headings, setHeadings] = useState<{ level: number; text: string; slug: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      contentRef.current = null;
    };
  }, []);

  // Gérer la détection du titre actif selon le scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '0px 0px -80% 0px' },
    );

    const headingElements = contentRef.current?.querySelectorAll('h1, h2, h3');
    headingElements?.forEach((el) => observer.observe(el));

    return () => headingElements?.forEach((el) => observer.unobserve(el));
  }, [content]);

  useEffect(() => {
    let active = true;
    const loadPage = async () => {
      const reportError = () => {
        if (active) {
          setContent(null);
          setHeadings([]);
          toast.error(t('error_loading_documentation'));
        }
      };
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}doc/${page}.md`);
        if (!response.ok) {
          reportError();
          return;
        }
        const text = await response.text();

        if (active) {
          setContent(text);
          setHeadings(extractHeadings(text));
        }
      } catch {
        reportError();
      }
    };
    if (page !== undefined) {
      void loadPage();
    }
    return () => {
      active = false;
    };
  }, [page, t]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' });
  };

  // Thème du contenu Markdown aligné sur les tokens sémantiques du site.
  const proseTokens = [
    '[--tw-prose-body:var(--foreground)]',
    '[--tw-prose-headings:var(--foreground)]',
    '[--tw-prose-lead:var(--foreground-secondary)]',
    '[--tw-prose-links:var(--info)]',
    '[--tw-prose-bold:var(--foreground)]',
    '[--tw-prose-counters:var(--muted-foreground)]',
    '[--tw-prose-bullets:var(--muted-foreground)]',
    '[--tw-prose-hr:var(--border)]',
    '[--tw-prose-quotes:var(--foreground)]',
    '[--tw-prose-quote-borders:var(--border)]',
    '[--tw-prose-captions:var(--muted-foreground)]',
    '[--tw-prose-code:var(--foreground)]',
    '[--tw-prose-pre-code:var(--foreground)]',
    '[--tw-prose-pre-bg:var(--primary)]',
    '[--tw-prose-th-borders:var(--border)]',
    '[--tw-prose-td-borders:var(--border)]',
  ].join(' ');

  // Retraits littéraux par niveau de titre (les classes dynamiques ne sont pas générées par le JIT).
  const tocIndentByLevel = ['ml-0', 'ml-4', 'ml-8'];

  return (
    <div className='flex h-full min-h-0 bg-primary'>
      {/* Menu global */}
      <DocsSidebar />

      {/* Contenu principal + sommaire */}
      <main className='flex min-h-0 min-w-0 flex-1'>
        {/* Sommaire interne */}
        {headings.length > 0 && (
          <nav
            aria-label={t('doc_table_of_contents')}
            className='sticky top-0 h-full w-64 shrink-0 overflow-y-auto border-l bg-background p-4'
          >
            <h2 className='mb-2 font-bold text-foreground'>{t('doc_table_of_contents')}</h2>
            <ul className='space-y-1'>
              {headings.map((h) => (
                <li
                  key={h.slug}
                  className={`${tocIndentByLevel[Math.min(h.level, 3) - 1]} ${
                    activeId === h.slug ? 'font-bold text-info' : ''
                  }`}
                >
                  <button
                    type='button'
                    onClick={() => scrollTo(h.slug)}
                    className='w-full text-left hover:underline'
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {/* Contenu Markdown */}
        {page === undefined ? (
          <NothingToShow />
        ) : (
          <ScrollArea className='h-full min-w-0 flex-1'>
            <div ref={contentRef} className={`prose max-w-none p-6 ${proseTokens}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]}
              >
                {content ?? ''}
              </ReactMarkdown>
            </div>
          </ScrollArea>
        )}
      </main>
    </div>
  );
};

export default DocumentationPage;
