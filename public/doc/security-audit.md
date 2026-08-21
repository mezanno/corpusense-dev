# Audit de sécurité — CorpuSense

> **Date :** 2026-08-21
> **Version auditée :** 1.5.1
> **Méthode :** Revue de code statique + analyse des dépendances (`npm audit`)
> **Référentiel :** [OWASP Top 10:2025](https://owasp.org/Top10/2025/)

---

## Référentiel OWASP Top 10:2025

| Code | Catégorie |
|------|-----------|
| A01 | Broken Access Control |
| A02 | Security Misconfiguration |
| A03 | Software Supply Chain Failures *(nouveau)* |
| A04 | Cryptographic Failures |
| A05 | Injection |
| A06 | Insecure Design |
| A07 | Authentication Failures |
| A08 | Software or Data Integrity Failures |
| A09 | Security Logging and Alerting Failures |
| A10 | Mishandling of Exceptional Conditions *(nouveau)* |

---

## Résumé exécutif

CorpuSense est une application web React (Vite + PWA) orientée annotation de documents IIIF. Le périmètre est **local/navigateur** : toutes les données utilisateur sont stockées côté client (IndexedDB / `localStorage`). L'application s'appuie sur Supabase pour les jobs OCR distants et sur des clés API tierces (Mistral, OpenAI, GitHub) configurées par l'utilisateur.

**19 points d'attention** identifiés :

| Criticité | Nombre |
|-----------|--------|
| 🔴 Haute | 5 |
| 🟠 Moyenne | 7 |
| 🟡 Basse | 5 |
| ℹ️ Info | 2 |

---

## A01 — Broken Access Control

### VULN-01 🟠 — Aucune protection de routes front-end

**Fichier :** `src/App.tsx`, `src/pages/StoragePage.tsx`
**Niveau :** Moyenne

L'application n'implémente pas de garde de routes. Le code de `StoragePage.tsx` montre une ancienne vérification d'authentification **commentée** :

```typescript
// if (status !== 'authenticated') { return (...) }
```

Toutes les pages sont accessibles sans authentification.

**Recommandation :**
- Si l'application doit supporter un accès distant ou multi-utilisateur, implémenter des guards de routes React Router.
- Documenter explicitement que l'application est conçue pour un usage local mono-utilisateur si c'est le cas.

---

## A02 — Security Misconfiguration

### VULN-02 🔴 — Mode debug Dexie activé en production

**Fichier :** `src/data/repositories/indexeddb/db.ts:79`
**Niveau :** Haute

```typescript
Dexie.debug = true;
```

Cette ligne active le mode debug pour **tous les environnements**, y compris la production. Elle expose la structure interne de la base IndexedDB, les requêtes et potentiellement des données utilisateur dans la console du navigateur.

**Recommandation :**
```typescript
// Conditionner au mode développement
Dexie.debug = import.meta.env.DEV;
```

---

### VULN-03 🟠 — Absence de Content Security Policy (CSP)

**Fichier :** `index.html`, `vite.config.ts`
**Niveau :** Moyenne

Aucune directive CSP n'est configurée. L'application communique avec plusieurs origines tierces (`api.mistral.ai`, `supabase.co`, `api.mezanno.xyz`) sans restriction de politique de sécurité.

**Recommandation :**
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  connect-src 'self'
    https://ilbjbghryyvjfdhgunhx.supabase.co
    https://api.mistral.ai
    https://api.mezanno.xyz;
  img-src 'self' blob: data: https:;
  style-src 'self' 'unsafe-inline';
">
```

---

### VULN-04 🟡 — Absence d'en-têtes de sécurité HTTP

**Niveau :** Basse

Les en-têtes suivants ne sont pas configurés côté serveur :
- `X-Frame-Options: DENY` (protection clickjacking)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`

**Recommandation :** Configurer ces en-têtes dans Nginx, Caddy ou Apache selon l'environnement de déploiement.

---

### VULN-05 🟡 — `console.log` de debug dans `vite.config.ts`

**Fichier :** `vite.config.ts:10`
**Niveau :** Basse

```typescript
console.log('process.env.NODE_ENV', process.env.REACT_APP_BASE);
```

Ce log est exécuté à chaque build et peut révéler des informations d'environnement dans les pipelines CI/CD.

**Recommandation :** Supprimer cette ligne.

---

## A03 — Software Supply Chain Failures

### VULN-06 🔴 — 23 vulnérabilités détectées par `npm audit`

**Niveau :** Haute

```
23 vulnérabilités (4 low, 5 moderate, 14 high)
```

Vulnérabilités notables :

| Package | Sévérité | Type | Fix disponible |
|---------|----------|------|---------------|
| `xlsx` | High | Prototype Pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS | ❌ Non |
| `brace-expansion` | High | DoS via expansion exponentielle | ✅ `npm audit fix` |
| `fast-uri` | High | Host confusion / SSRF bypass | ✅ `npm audit fix` |
| `ip-address` | High | SSRF / trust-boundary bypass | ✅ `npm audit fix` |
| `image-size` | High | DoS via boucle infinie | ❌ Non |
| `@hono/node-server` | Moderate | Path traversal (Windows) | ✅ `npm audit fix` |
| `dompurify` | Moderate | Bypass XSS (≤3.4.12) | ✅ `npm audit fix` |

**Recommandation :**
```bash
# Corriger les vulnérabilités automatiquement corrigeables
npm audit fix

# Pour xlsx, envisager une alternative activement maintenue :
# - exceljs  (npm install exceljs)
# - @sheetjs/pro (version commerciale)
```

---

### VULN-07 🟠 — Dépendance GitHub privée sans version fixée

**Fichier :** `package.json:78`
**Niveau :** Moyenne

```json
"cozy-iiif": "github:jonathan-epita/cozy-iiif"
```

Cette dépendance pointe sur un dépôt GitHub sans commit ou tag fixé. Risques : compromission du dépôt source, suppression de dépôt, ou **dependency confusion attack**.

**Recommandation :**
```json
"cozy-iiif": "github:jonathan-epita/cozy-iiif#v1.2.3"
```
Ou publier le package sur npm (même privé) pour bénéficier du lock npm.

---

## A04 — Cryptographic Failures

### VULN-08 🔴 — Clés API tierces stockées en clair dans `localStorage`

**Fichiers :** `ConfigurationAPITab.tsx`, `ConfigurationGeneralTab.tsx`, `mistral.ts`, `openai.ts`
**Niveau :** Haute

Les clés API (Mistral, OpenAI, GitHub PAT) sont lues et écrites directement dans `localStorage` :

```typescript
// ConfigurationGeneralTab.tsx:42
localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, values.github_token.trim());

// mistral.ts:116
const mistralModel = localStorage.getItem('mistralModel') ?? 'mistral-medium-latest';
```

`localStorage` est accessible à **tout script JavaScript** s'exécutant sur la même origine. Un script tiers (extension malveillante, XSS résiduel) peut exfiltrer ces clés en totalité.

**Recommandation :**
- Utiliser `sessionStorage` pour réduire la persistance.
- Pour les tokens GitHub PAT, ne pas les persister et les demander à chaque session.
- Afficher un avertissement explicite à l'utilisateur sur les risques.
- Explorer l'API Web Crypto pour un chiffrement côté client.

---

### VULN-09 🟠 — Variables d'environnement VITE_* exposées dans le bundle de production

**Fichier :** `src/utils/config.ts`, `.env`
**Niveau :** Moyenne

Toutes les variables `VITE_*` sont injectées **en clair** dans le bundle JS par Vite, y compris la clé anonyme Supabase et la clé EmailJS. Ces valeurs sont visibles via `strings dist/*.js`.

**Recommandation :**
- La clé anon Supabase est par nature publique (conçue pour usage client), mais sa présence doit être documentée.
- Configurer dans la console EmailJS que seul votre domaine de production peut utiliser ces identifiants (restriction par domaine).
- Vérifier que les règles RLS (Row Level Security) Supabase sont correctement configurées pour limiter l'accès avec la clé anonyme.

---

### VULN-10 🟡 — Token GitHub PAT sans expiration documentée

**Fichier :** `ConfigurationGeneralTab.tsx`
**Niveau :** Basse

Le token GitHub est stocké indéfiniment dans `localStorage`. Un PAT avec des permissions larges peut permettre l'accès complet aux dépôts GitHub associés.

**Recommandation :**
- Documenter les permissions **minimales** requises pour ce PAT.
- Afficher un avertissement sur la sensibilité de ce token dans l'interface.
- Envisager des GitHub Apps avec tokens à durée limitée.

---

## A05 — Injection

### VULN-11 🔴 — Proxy open-relay exposé à des attaques SSRF

**Fichier :** `proxy.js`
**Niveau :** Haute

Le serveur proxy Express implémente un open relay : toute URL passée en paramètre est récupérée sans validation.

```javascript
app.get('/proxy', async (req, res) => {
  const { url } = req.query; // ← aucune validation
  const response = await axios.get(url, { ... });
  res.json(response.data);
});
```

**Risques :**
- **SSRF :** Ciblage de ressources internes (`http://169.254.169.254/`, `http://localhost:5432/`)
- **Open proxy :** Masquage de l'origine de requêtes malveillantes
- CORS ouvert (`app.use(cors())`) sans restriction d'origine

**Recommandation :**
```javascript
const ALLOWED_HOSTS = ['gallica.bnf.fr', 'api.bnf.fr', 'iiif.example.org'];

app.get('/proxy', async (req, res) => {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return res.status(403).json({ error: 'Host non autorisé' });
    }
  } catch {
    return res.status(400).json({ error: 'URL invalide' });
  }
  // ...
});
```

---

### VULN-12 🟠 — Chargement de Markdown via paramètre d'URL sans validation

**Fichier :** `src/pages/DocumentationPage.tsx:66`
**Niveau :** Moyenne

```typescript
const response = await fetch(`./${page}.md`);
```

Le paramètre `page` provient de `useParams()`. Un utilisateur pourrait tenter des chemins traversants (`../../etc/passwd`). En production (SPA statique), le risque est mitigé par le serveur, mais en dev Vite il reste potentiellement exploitable.

**Recommandation :**
```typescript
const safePage = page?.replace(/[^a-zA-Z0-9_-]/g, '');
const response = await fetch(`./${safePage}.md`);
```

---

### VULN-13 🟠 — Contenu OCR externe injecté sans sanitisation

**Fichier :** `src/state/sagas/plugins/workers/mistralOcr.ts`
**Niveau :** Moyenne

Le contenu textuel retourné par l'API Mistral est directement stocké en annotation sans sanitisation. Si ce contenu est ensuite rendu via `react-markdown`, des payloads Markdown (liens `javascript:`, HTML embarqué) pourraient être interprétés.

**Recommandation :**
- Sanitiser le contenu OCR avant stockage.
- Configurer `react-markdown` avec `rehype-sanitize` pour les rendus de contenu non contrôlé.

---

## A06 — Insecure Design

### VULN-14 🟡 — Design du proxy sans authentification ni rate-limiting

**Fichier :** `proxy.js`
**Niveau :** Basse

En complément de VULN-11, le proxy ne dispose d'aucun mécanisme d'authentification ni de limitation de débit. S'il est déployé sur un serveur accessible, il peut être utilisé par n'importe quel acteur externe.

**Recommandation :**
- Ajouter un token d'authentification simple côté proxy (header `X-Proxy-Token`).
- Mettre en place un rate-limiting avec `express-rate-limit`.

---

## A07 — Authentication Failures

### VULN-15 🟠 — Clé `VITE_SUPABASE_ANON_KEY` potentiellement exposée dans l'historique Git

**Fichier :** `.env`
**Niveau :** Moyenne

Le fichier `.env` est dans `.gitignore`, mais **s'il a été commité ne serait-ce qu'une fois**, les clés JWT Supabase et EmailJS sont compromises de manière permanente dans l'historique.

```
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_EMAILJS_PUBLIC_KEY=9Kd0rISfNl3xuSH2b
```

**Recommandation :**
```bash
# Vérifier si le fichier a été commité
git log --all --full-history -- .env
```
Si oui :
1. Invalider **immédiatement** les clés dans la console Supabase et EmailJS.
2. Utiliser `git filter-repo` pour purger l'historique.
3. Mettre en place un hook `pre-commit` (`gitleaks`, `detect-secrets`).

---

## A08 — Software or Data Integrity Failures

### VULN-16 🟠 — Import de base de données sans validation de schéma

**Fichier :** `src/hooks/useDbBackup.ts`
**Niveau :** Moyenne

La fonctionnalité d'import IndexedDB accepte tout fichier JSON sans valider sa structure. Un fichier malformé ou intentionnellement malveillant pourrait corrompre l'ensemble de la base locale.

**Recommandation :**
- Valider le schéma du fichier importé avec Zod avant tout import.
- Afficher un résumé (nombre d'enregistrements par table) avant confirmation.
- Effectuer un backup automatique avant tout import.

---

### VULN-17 🟡 — Tables de migration legacy non nettoyées

**Fichier :** `src/data/repositories/indexeddb/sources.ts:283-285`
**Niveau :** Basse

Les instructions de nettoyage des tables legacy sont commentées :

```typescript
// await db.storedManifests.clear();
// await db.storedManifestContents.clear();
// await db.convertedFiles.clear();
```

Ces tables contiennent des données potentiellement dupliquées qui persistent indéfiniment.

**Recommandation :** Décommenter une fois la migration validée, ou documenter explicitement pourquoi ces tables doivent être conservées.

---

## A09 — Security Logging and Alerting Failures

### VULN-18 🟡 — Logs `console.log` excessifs en production

**Niveau :** Basse

Plus de 60 occurrences de `console.log` actifs en production, exposant des données potentiellement sensibles :

```typescript
// useJobRealtime.tsx:162 — expose le payload Supabase complet
console.log('handleJobRowUpdate ', job);

// sources.ts:264 — expose le mapping d'IDs de migration
console.log('manifestIdMap: ', manifestIdMap);

// workers.ts:98 — expose le résultat complet d'un worker OCR
console.log(`Worker ${worker.name} finished with result:`, result);
```

**Recommandation :**
- Supprimer ou conditionner les logs via un wrapper de logging.
- Configurer la suppression automatique via Vite/Terser :
```typescript
// vite.config.ts
build: {
  terserOptions: { compress: { drop_console: true } }
}
```

---

## A10 — Mishandling of Exceptional Conditions

### VULN-19 ℹ️ — Erreurs avalées silencieusement dans plusieurs endroits

**Niveau :** Info

Plusieurs `catch` blocs ignorent l'erreur ou la réduisent à un message générique, ce qui empêche de diagnostiquer les problèmes en production :

```typescript
// default.ts:32-34
} catch (error) {
  throw new Error(i18n.t('error_unknown')); // perd le détail de l'erreur originale
}
```

**Recommandation :**
- Logger les erreurs originales (au moins en développement) avant de lancer une erreur utilisateur-friendly.
- Centraliser la gestion des erreurs avec un service de monitoring (Sentry, OpenTelemetry déjà présent dans les dépendances).

---

## Plan d'action recommandé

### Priorité 1 — Immédiat (avant la prochaine mise en production)

| ID | OWASP 2025 | Action |
|----|------------|--------|
| VULN-11 | A05 | Ajouter une liste blanche d'hôtes dans `proxy.js` |
| VULN-02 | A02 | Conditionner `Dexie.debug` à `import.meta.env.DEV` |
| VULN-06 | A03 | Exécuter `npm audit fix` |
| VULN-15 | A07 | Vérifier l'historique Git et invalider les clés si exposées |

### Priorité 2 — Court terme (sprint suivant)

| ID | OWASP 2025 | Action |
|----|------------|--------|
| VULN-08 | A04 | Documenter/avertir sur le stockage en clair des clés API |
| VULN-03 | A02 | Mettre en place une CSP |
| VULN-04 | A02 | Configurer les en-têtes HTTP de sécurité côté serveur |
| VULN-18 | A09 | Supprimer les `console.log` de production |
| VULN-06 | A03 | Étudier le remplacement de `xlsx` par `exceljs` |

### Priorité 3 — Moyen terme

| ID | OWASP 2025 | Action |
|----|------------|--------|
| VULN-12 | A05 | Valider le paramètre `page` dans `DocumentationPage` |
| VULN-13 | A05 | Ajouter `rehype-sanitize` pour les rendus Markdown |
| VULN-07 | A03 | Fixer la dépendance `cozy-iiif` sur un tag ou commit |
| VULN-16 | A08 | Valider le schéma des imports de base de données |
| VULN-17 | A08 | Activer le nettoyage des tables legacy |

---

## Contexte de l'analyse

Cette analyse porte sur une **application conçue pour un usage local/navigateur**, ce qui atténue plusieurs risques (pas de backend applicatif exposé, pas de multi-utilisateurs). Les risques les plus concrets dans ce contexte sont :

1. **A03** — La dépendance `xlsx` vulnérable (Prototype Pollution) sans fix disponible
2. **A04** — La fuite de clés API via `localStorage`
3. **A05** — Le proxy SSRF si `proxy.js` est déployé sur un serveur accessible
4. **A02** — L'absence de CSP qui amplifierait tout XSS résiduel
5. **A07** — L'exposition potentielle des clés Supabase dans l'historique Git

---

*Rapport généré par audit de code statique — À réviser lors de tout changement d'architecture significatif.*
*Référentiel : [OWASP Top 10:2025](https://owasp.org/Top10/2025/)*
