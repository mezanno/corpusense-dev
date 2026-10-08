# Registre de sécurité

_Registre vivant consolidé à partir de l'audit OWASP Top 10:2025 du 2026-08-21 et de la revue du 2026-09-30, re-vérifié contre le code le 2026-10-08. Menaces structurelles assumées : D-011 (mono-utilisateur local). À réviser lors de tout changement d'architecture significatif._

## Périmètre de confiance

Application locale/navigateur sans backend applicatif : la donnée utilisateur réside dans son navigateur (IndexedDB, localStorage). Les surfaces réellement exposées sont (a) la chaîne d'approvisionnement logicielle, (b) le stockage des clés API tierces, (c) les services connectés (Supabase, LLM, OCR) et leurs règles d'accès, (d) tout script tiers exécuté sur l'origine.

## Registre des points ouverts

| ID   | Criticité | Owasp | Constat (vérifié 2026-10-08)                                                                                                                                                                                                                                                | Action                                                                                                                |
| ---- | --------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| S-01 | 🟠        | A01   | Pas de garde de routes — **assumé** (D-011). À réexaminer seulement si un accès distant/multi-utilisateur devient réel : guards React Router derrière `ConnectedUserContext`.                                                                                               | Documenter l'intention (fait, D-011) ; rien de plus tant que le périmètre de confiance ne change pas.                 |
| S-02 | ✅        | A02   | `Dexie.debug = true` inconditionnel (`src/data/repositories/indexeddb/db.ts:119 au 2026-10-08`) — exposait requêtes et données en console, y compris en production. **Clos dans l'arbre de travail** : l'affectation a été supprimée (Dexie désactive le debug par défaut). | Rien ; option : raviver le debug en dev seulement via `Dexie.debug = import.meta.env.DEV`.                            |
| S-03 | 🟠        | A02   | Aucune CSP et aucun en-tête de sécurité HTTP (ni `index.html`, ni `_headers`, ni config serveur). Amplifierait tout XSS résiduel.                                                                                                                                           | CSP `default-src 'self'` + `connect-src` borné aux origines connues ; en-têtes côté serveur d'hébergement.            |
| S-04 | 🟠        | A04   | Clés API tierces (Mistral, OpenAI, GitHub PAT) en clair dans `localStorage` — **risque accepté et documenté** (D-011 : la machine de l'utilisateur est sa frontière). Le PAT GitHub doit rester à portée minimale.                                                          | Avertissement UI sur la sensibilité + doc des permissions minimales du PAT ; envisager `sessionStorage` pour le PAT.  |
| S-05 | 🟠        | A03   | Supply chain : `xlsx@0.18` vulnérable sans correctif amont (prototype pollution/ReDoS) ; `cozy-iiif` pointé sur GitHub **sans tag ni commit fixés** ; `tesseract.js` encore en dépendance alors que le plugin est retiré (`workers/old/`).                                  | Évaluer `exceljs` ; épingler `cozy-iiif#vX.Y.Z` ; retirer `tesseract.js` avec Q5 ; `npm audit` régulier en CI (Q3).   |
| S-06 | 🟡        | A05   | `DocumentationPage.tsx` fetche `./${page}.md` avec `page` non assaini (traversée de chemin contenue par le serveur statique en prod, exploitable en dev).                                                                                                                   | Sanitiser le slug (retirer `[^a-z0-9_-]`) ou liste blanche depuis `index.json`.                                       |
| S-07 | 🟡        | A05   | Contenu OCR/LLM distant rendu sans assainissement Markdown dédié (`rehype-sanitize` absent ; seuls `rehype-slug`/`autolink` sont présents).                                                                                                                                 | `rehype-sanitize` sur tout rendu de contenu non contrôlé.                                                             |
| S-08 | 🟡        | A08   | Import de base (`src/hooks/useDbBackup.ts`) sans validation de schéma du JSON importé.                                                                                                                                                                                      | Validation Zod + résumé avant import + backup automatique préalable.                                                  |
| S-09 | 🟡        | A09   | ~59 `console.log` actifs en production (payloads Supabase, résultats de workers, mappings de migration).                                                                                                                                                                    | Wrapper de logging ou `drop_console` à la compilation ; en attendant, journaliser via un module unique.               |
| S-10 | 🟡        | A08   | Nettoyage des tables legacy commenté (`sources.ts:375-376` : `storedManifests`, `storedManifestContents`, `convertedFiles`) : données dupliquées persistantes après migration.                                                                                              | Décommenter une fois la migration validée, ou documenter la conservation.                                             |
| S-11 | ℹ️        | A07   | `.env` a été commité **avant** son ajout au `.gitignore` (vu dans l'historique). Son contenu actuel n'est que des clés `VITE_*` publiques par design (anon Supabase), mais le `.gitignore` est un leurre : le fichier reste consultable dans l'historique.                  | `git rm --cached .env tsconfig.tsbuildinfo` (roadmap Q5) ; hook anti-secrets si d'autres dépôts partagent l'instance. |

## Points fermés (pour mémoire)

- **Proxy open-relay SSRF** (ex-VULN-11/14, A05/A06) : fermé par la **suppression de `proxy.js`** — le contournement CORS de dev n'existe plus ; ne pas le réintroduire sans liste blanche d'hôtes.
- **Erreurs avalées remplacées par des génériques** (ex-VULN-19, A10) : clos par la discipline D-002 (un boundary relaie ou enrobe avec `cause`, jamais ne remplace) et le garde-fou ESLint.
- **Points d'injection (sinks) directs** : zéro `innerHTML` / `dangerouslySetInnerHTML` / `eval` dans `src/` (vérifié 2026-10-08).

## Priorités d'action

1. **Immédiat** : S-11, `npm audit fix` sur ce qui est corrigeable (S-02 : clos dans l'arbre de travail, à committer).
2. **Court terme** : S-03 (CSP + en-têtes), S-09, S-05.
3. **Moyen terme** : S-06, S-07, S-08, S-10.
