// Libellés FR réels utilisés par les specs E2E — valeurs exactes de
// `public/locales/fr` (traduction.json / welcome.json), clé source en commentaire.
//
// Les clés i18n sont stables, les phrases peuvent bouger : un commit de traduction
// ne doit casser qu'un seul fichier (plan Q9 § 3, D-010 : tests par rôles accessibles
// et libellés, jamais par sélecteurs visuels ou `data-testid`).
export const WELCOME_TITLE = 'Bienvenue sur Corpusense'; // welcome.json → title
export const SIDEBAR_TOGGLE = 'Basculer le menu latéral'; // translation.json → sidebar_toggle
export const EMPTY_COLLECTIONS = "Vous n'avez aucune collection actuellement"; // → info_no_collection
export const CREATE_COLLECTION = 'Créer une nouvelle collection'; // → btn_create_collection
export const OPEN_MANIFEST = 'Ouvrir un manifest'; // → btn_open_manifest
export const LOAD_MANIFEST_STEP_1 = '1. Charger un manifest IIIF'; // → title_load_manifest_step_1
export const MANIFEST_INPUT_PLACEHOLDER = 'URL du manifest ou identifiant ARK (Gallica)'; // → form_placeholder_manifest_content
export const ADD_TO_LIBRARY = 'Ajouter à ma bibliothèque'; // → btn_add_manifest_to_library
export const NAV_SOURCES = 'Sources de données'; // → nav_sources

// --- Ajouts étape 3 (S1 : import manifest → bibliothèque) ---
export const ADD_NEW_DOCUMENT = 'Ajouter un nouveau document'; // → btn_add_pdf (carte pointillée des tableaux de bord de sources)
export const PAGE_TITLE_IIIF_STORAGE = 'Bibliothèques en ligne'; // → page_title_iiif_storage
export const LOAD_MANIFEST_STEP_2 = '2. Ajouter le manifest à votre bibliothèque Corpusense'; // → title_load_manifest_step_2
export const BTN_CLOSE = 'Fermer'; // → btn_close (bouton d'annulation du dialogue d'import)
export const MANIFEST_GRID = 'grille des manifests'; // → aria_label_manifest_grid (section de la liste des sources, explorateur)

// --- Ajouts étape 3 (S2 : collection depuis la source, inspecteur) ---
export const CANVAS_GALLERY = 'galerie des canvas'; // → aria_label_canvas_gallery
export const DEFINE_SELECTION_START = 'Définir le début de sélection ici'; // → menu_define_start
export const CREATE_FROM_SELECTION = 'Créer une collection à partir de la sélection'; // → menu_create_from_selection
export const BTN_CREATE = 'Créer'; // → btn_create (confirmation du dialogue de création)
export const COLLECTION_NAME_LABEL = 'Nom de la collection'; // → form_label_collection_name (aussi table_col_title_collection_name)
export const BTN_OPEN = 'Ouvrir'; // → btn_open (œil d'ouverture dans le tableau des collections)
export const TITLE_METADATA_COLLECTION = 'Collection'; // → title_metadata_collection (déclencheur de l'en-tête inspecteur)

// --- Libellés interpolés : gabarits + fabricants ({{number}} est la syntaxe i18next) ---
export const NUMBER_OF_COLLECTIONS = 'Vous avez {{number}} collection(s)'; // → info_number_of_collections
export const NUMBER_OF_ITEMS = '{{number}} élément(s)'; // → info_number_of_items

export const numberOfCollections = (count: number): string =>
  NUMBER_OF_COLLECTIONS.replace('{{number}}', String(count));

export const numberOfItems = (count: number): string =>
  NUMBER_OF_ITEMS.replace('{{number}}', String(count));
