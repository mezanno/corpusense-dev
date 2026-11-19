/**
 * Lot 23 — useIsDarkImage (cf. docs/roadmap.md, Q11). Hook UI pur : ni store, ni base,
 * ni QueryClient — le harnais du lot 0 n'est pas nécessaire, seul `renderHook` de RTL est monté.
 *
 * Frontières (les seules stubbées, conformément au plan) :
 * - `Image` : jsdom ne charge aucune ressource, donc `img.onload` n'y est jamais déclenché
 *   spontanément. Le constructeur global est remplacé par un faux qui enregistre les instances
 *   et ne fait rien au moment du `src` ; c'est le TEST qui déclenche `onload` quand il le décide
 *   (`media.fireLoad`). Aucun réseau, aucun délai, aucun décodage : le bord le plus bas
 *   documenté de l'API image.
 * - Canvas : `getContext('2d')` est espionné par test et renvoie un contexte 2d factice dont
 *   `getImageData` répond pixel par pixel selon le cas déclaré (`setPixels`). Le mock canvas
 *   global de la suite (`vitest.setup.ts` → `vitest-webgl-canvas-mock`) est donc entièrement
 *   court-circuité ici : sa lecture renverrait du noir transparent quel que soit le cas.
 *   Un cas non déclaré est un échec bruyant (tripwire), jamais un défaut silencieux.
 * - Rien d'autre n'est mocké : le vrai React, le vrai effet, la vraie boucle de luminance.
 *
 * Décision couverte (moyenne des luminances perçues Rec. 709 sur la grille 16×16, `< 0,5`) :
 * noir/blanc pleins, seuil gris 127/128, poids des canaux (rouge/bleu sombres, vert clair),
 * mixtes 3/4–1/4 dans les deux sens, moitié exacte (tranchant flottant, voir écarts), cas
 * transparents (alpha ignoré — non-régression demandée par le plan), dimensions de
 * rééchantillonnage (canvas forcé en 16×16, `drawImage`/`getImageData` à la grille complète),
 * contexte indisponible, lecture souillée qui lève, url absente/null/chargée/remplacée,
 * chargement après démontage (garde `cancelled`) et défaut clair avant toute fin de chargement.
 *
 * Écarts constatés (règle 7 — documentés et remontés, pas corrigés) :
 * - le canal alpha est ignoré par la formule : une image entièrement transparente (noir ×alpha 0)
 *   est classée SOMBRE ; une grande surface transparente noie aussi les pixels opaques clairs
 *   dans la moyenne. Caractérisé par les tests « transparents », pas légitimé ;
 * - une image très exactement moitié sombre / moitié claire tombe à 0,49999999999999994 en
 *   arithmétique flottante et est donc classée sombre : le `< 0,5` n'est pas exact à 127,5 ;
 * - le hook ne pose pas de `onerror` : un chargement qui échoue laisse le défaut clair sans
 *   aucun signal observable (caractérisé, pas corrigé) ;
 * - après démontage, l'`onload` périmé crée quand même le canvas (le contexte est obtenu avant
 *   la garde `cancelled`) — seul l'état est protégé, `drawImage` n'est pas appelé ;
 * - un canvas souillé (image cross-origin sans CORS) lève à la lecture : le catch ramène le
 *   défaut clair, sans journal ni toast (caractérisé par le test « souillé »).
 */
import { act, renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useIsDarkImage from '../useIsDarkImage';

/** Grille de rééchantillonnage du hook (constante privée SAMPLE_SIZE — valeur épinglée ici). */
const SAMPLE_SIZE = 16;
const PIXEL_COUNT = SAMPLE_SIZE * SAMPLE_SIZE;

/* ------------------------------------------------------------------ */
/* Fabriques de cas pixels                                             */
/* ------------------------------------------------------------------ */

interface PixelBlock {
  count: number;
  rgba: [number, number, number, number];
}

/** Fabrique de cas : `getImageData` renverra ces pixels (blocs consécutifs, total = 16×16). */
function pixelBlocks(...blocks: PixelBlock[]): () => Uint8ClampedArray {
  return () => {
    const data = new Uint8ClampedArray(PIXEL_COUNT * 4);
    let offset = 0;
    for (const block of blocks) {
      for (let i = 0; i < block.count; i += 1) {
        data.set(block.rgba, offset);
        offset += 4;
      }
    }
    if (offset !== data.length) {
      throw new Error(
        `Cas de pixels invalide : ${offset / 4} pixels fournis, attendu ${PIXEL_COUNT}`,
      );
    }
    return data;
  };
}

/** Image pleine d'une couleur uniforme. */
function uniform(r: number, g: number, b: number, a = 255): () => Uint8ClampedArray {
  return pixelBlocks({ count: PIXEL_COUNT, rgba: [r, g, b, a] });
}

/** Deux moitiés consécutives (mélanges, cas transparents dilués). */
function split(
  first: [number, number, number, number],
  firstCount: number,
  second: [number, number, number, number],
): () => Uint8ClampedArray {
  return pixelBlocks(
    { count: firstCount, rgba: first },
    { count: PIXEL_COUNT - firstCount, rgba: second },
  );
}

/* ------------------------------------------------------------------ */
/* Frontière média factice (Image + canvas 2d), cf. en-tête             */
/* ------------------------------------------------------------------ */

interface FakeImage {
  onload: (() => void) | null;
  src: string;
}

interface FakeMedia {
  images: FakeImage[];
  canvases: HTMLCanvasElement[];
  context: {
    drawImage: Mock<(image: unknown, dx: number, dy: number, dw: number, dh: number) => void>;
    getImageData: Mock<
      (sx: number, sy: number, sw: number, sh: number) => { data: Uint8ClampedArray }
    >;
  };
  /** Déclare le cas de pixels que la lecture du canvas renverra. */
  setPixels: (pixels: () => Uint8ClampedArray) => void;
  /** Simule la fin de chargement réussie de l'image `index` (0 par défaut). */
  fireLoad: (index?: number) => void;
  /** Fait répondre `null` à `getContext('2d')` (contexte indisponible). */
  setContextUnavailable: () => void;
}

function installFakeMedia(): FakeMedia {
  const images: FakeImage[] = [];
  vi.stubGlobal(
    'Image',
    class FakeImageLoader implements FakeImage {
      onload: (() => void) | null = null;
      src = '';
      constructor() {
        images.push(this);
      }
    },
  );

  let contextAvailable = true;
  let pixels: () => Uint8ClampedArray = () => {
    throw new Error('cas de pixels non déclaré avant la lecture du canvas');
  };
  const canvases: HTMLCanvasElement[] = [];
  const context: FakeMedia['context'] = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels() })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    contextId: string,
  ): ReturnType<typeof HTMLCanvasElement.prototype.getContext> {
    if (!contextAvailable || contextId !== '2d') return null;
    canvases.push(this);
    return context as unknown as ReturnType<typeof HTMLCanvasElement.prototype.getContext>;
  });

  return {
    images,
    canvases,
    context,
    setPixels(factory) {
      pixels = factory;
    },
    fireLoad(index = 0) {
      act(() => {
        images[index].onload?.();
      });
    },
    setContextUnavailable() {
      contextAvailable = false;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

describe('useIsDarkImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('url absente', () => {
    it.each<[string, string | null | undefined]>([
      ['null', null],
      ['undefined', undefined],
      ['chaîne vide', ''],
    ])('retourne false et ne charge rien pour url = %s', (_label, url) => {
      const media = installFakeMedia();
      const { result } = renderHook(() => useIsDarkImage(url));
      expect(result.current).toBe(false);
      expect(media.images).toHaveLength(0);
      expect(media.context.getImageData).not.toHaveBeenCalled();
    });
  });

  describe('décision sombre/clair', () => {
    it.each<[string, () => Uint8ClampedArray, boolean]>([
      ['image pleine noire', uniform(0, 0, 0), true],
      ['image pleine blanche', uniform(255, 255, 255), false],
      ['gris 127 (127/255 < 0,5)', uniform(127, 127, 127), true],
      ['gris 128 (128/255 > 0,5)', uniform(128, 128, 128), false],
      ['rouge pur (0,2126)', uniform(255, 0, 0), true],
      ['vert pur (0,7152)', uniform(0, 255, 0), false],
      ['bleu pur (0,0722)', uniform(0, 0, 255), true],
      ['trois quarts noir, un quart blanc', split([0, 0, 0, 255], 192, [255, 255, 255, 255]), true],
      ['un quart noir, trois quarts blanc', split([0, 0, 0, 255], 64, [255, 255, 255, 255]), false],
      [
        // Non-régression du cas transparent demandée par le plan : alpha 0, noir RVB → sombre.
        'entièrement transparente (noir, alpha 0) — alpha ignoré',
        uniform(0, 0, 0, 0),
        true,
      ],
      [
        'entièrement transparente (blanc, alpha 0) — la décision ne suit que le RVB',
        uniform(255, 255, 255, 0),
        false,
      ],
      [
        'taches blanches opaques sur fond transparent noir',
        split([255, 255, 255, 255], 16, [0, 0, 0, 0]),
        true,
      ],
      [
        'moitié noire, moitié blanche (0,49999999999999994 en flottant → sombre)',
        split([0, 0, 0, 255], 128, [255, 255, 255, 255]),
        true,
      ],
    ])('%s', (_label, pixels, expected) => {
      const media = installFakeMedia();
      media.setPixels(pixels);
      const { result } = renderHook(() => useIsDarkImage('blob://image'));
      media.fireLoad();
      expect(result.current).toBe(expected);
    });
  });

  describe('dimensions et rééchantillonnage', () => {
    it('réduit toute source à la grille fixe 16×16 avant décision', () => {
      const media = installFakeMedia();
      media.setPixels(uniform(0, 0, 0));
      const { result } = renderHook(() => useIsDarkImage('blob://image'));
      media.fireLoad();
      // Le hook force le canvas de travail à 16×16 quelle que soit la taille source.
      expect(media.canvases).toHaveLength(1);
      expect(media.canvases[0].width).toBe(SAMPLE_SIZE);
      expect(media.canvases[0].height).toBe(SAMPLE_SIZE);
      expect(media.context.drawImage).toHaveBeenCalledWith(
        media.images[0],
        0,
        0,
        SAMPLE_SIZE,
        SAMPLE_SIZE,
      );
      expect(media.context.getImageData).toHaveBeenCalledWith(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      expect(result.current).toBe(true);
    });
  });

  describe('dégradés de la frontière canvas', () => {
    it('reste clair si le contexte 2d est indisponible', () => {
      const media = installFakeMedia();
      media.setContextUnavailable();
      const { result } = renderHook(() => useIsDarkImage('blob://image'));
      media.fireLoad();
      expect(result.current).toBe(false);
      expect(media.context.drawImage).not.toHaveBeenCalled();
      expect(media.context.getImageData).not.toHaveBeenCalled();
    });

    it('garde le défaut clair quand la lecture des pixels lève (canvas souillé cross-origin)', () => {
      const media = installFakeMedia();
      media.setPixels(() => {
        throw new DOMException(
          'The canvas has been tainted by cross-origin data.',
          'SecurityError',
        );
      });
      const { result } = renderHook(() => useIsDarkImage('https://exemple.org/image.png'));
      media.fireLoad();
      expect(media.context.drawImage).toHaveBeenCalled();
      expect(media.context.getImageData).toHaveBeenCalledWith(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      expect(result.current).toBe(false);
    });
  });

  describe('cycle de vie', () => {
    it('est clair au montage, charge l’url demandée et ne touche le canvas qu’après onload', () => {
      const media = installFakeMedia();
      media.setPixels(uniform(0, 0, 0));
      const { result } = renderHook(() => useIsDarkImage('blob://image'));
      expect(result.current).toBe(false);
      expect(media.images).toHaveLength(1);
      expect(media.images[0]?.src).toBe('blob://image');
      expect(media.context.getImageData).not.toHaveBeenCalled();
      media.fireLoad();
      expect(result.current).toBe(true);
    });

    it('laisse le défaut clair si le chargement n’aboutit jamais (aucun onerror posé)', () => {
      const media = installFakeMedia();
      media.setPixels(uniform(0, 0, 0));
      const { result } = renderHook(() => useIsDarkImage('blob://image'));
      expect(result.current).toBe(false);
      expect(media.context.drawImage).not.toHaveBeenCalled();
    });

    it('ignore le chargement d’une image périmée quand l’url a changé', () => {
      const media = installFakeMedia();
      media.setPixels(uniform(0, 0, 0));
      const { result, rerender } = renderHook(({ url }: { url: string }) => useIsDarkImage(url), {
        initialProps: { url: 'blob://a' },
      });
      media.fireLoad(0);
      expect(result.current).toBe(true);

      rerender({ url: 'blob://b' });
      expect(media.images).toHaveLength(2);
      media.setPixels(uniform(255, 255, 255));
      media.fireLoad(1);
      expect(result.current).toBe(false);

      // La première image (sombre) chargerait en retard : sa décision doit être ignorée.
      media.setPixels(uniform(0, 0, 0));
      media.fireLoad(0);
      expect(result.current).toBe(false);
    });

    it('revient au défaut clair quand l’url repasse à null', () => {
      const media = installFakeMedia();
      media.setPixels(uniform(0, 0, 0));
      const { result, rerender } = renderHook<boolean, { url: string | null }>(
        ({ url }) => useIsDarkImage(url),
        { initialProps: { url: 'blob://a' } },
      );
      media.fireLoad();
      expect(result.current).toBe(true);
      rerender({ url: null });
      expect(result.current).toBe(false);
      expect(media.images).toHaveLength(1);
    });

    it('ne met plus à jour l’état quand l’image se charge après démontage', () => {
      const media = installFakeMedia();
      media.setPixels(uniform(0, 0, 0));
      const { result, unmount } = renderHook(() => useIsDarkImage('blob://a'));
      unmount();
      media.fireLoad();
      expect(result.current).toBe(false);
      // La garde cancelled intervient après getContext (un canvas est créé, écart documenté)
      // mais avant tout dessin : rien n'est peint ni lu.
      expect(media.canvases).toHaveLength(1);
      expect(media.context.drawImage).not.toHaveBeenCalled();
      expect(media.context.getImageData).not.toHaveBeenCalled();
    });
  });
});
