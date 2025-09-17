# Development Setup - Type Safety & Linting

Ce guide explique la configuration TypeScript et ESLint mise en place pour garantir une qualité de code maximale avec détection automatique d'erreurs.

## 🎯 Objectif

Détecter automatiquement les erreurs de type et de qualité de code avant leur intégration, garantissant un code robuste et maintenable en production.

## 📋 Configuration Mise en Place

### 1. TypeScript Strict Mode

**Fichier**: `tsconfig.json`

Configuration TypeScript avec des règles strictes mais équilibrées :

- ✅ **Type Safety** : `strict: true`, `noImplicitAny: true`
- ✅ **Better Error Detection** : `noImplicitThis`, `noImplicitOverride`
- ✅ **Switch Completeness** : `noFallthroughCasesInSwitch`
- ✅ **Clean Builds** : `noErrorTruncation`, `pretty`

**Rules pragmatiques** (désactivées pour éviter la friction) :
- `noPropertyAccessFromIndexSignature: false` - Permet `obj.prop` vs `obj['prop']`
- `exactOptionalPropertyTypes: false` - Plus flexible avec les propriétés optionnelles
- `noUnusedLocals/Parameters: false` - Géré par ESLint avec plus de flexibilité

### 2. ESLint Configuration Avancée

**Fichier**: `.eslintrc.json`

Configuration ESLint avec règles strictes pour la qualité :

#### TypeScript Rules
- ❌ **`@typescript-eslint/no-explicit-any`: "error"** - Interdiction du type `any`
- ⚠️ **`@typescript-eslint/no-non-null-assertion`: "warn"** - Attention aux `!`
- ❌ **`@typescript-eslint/prefer-nullish-coalescing`** - Utiliser `??` au lieu de `||`
- ❌ **`@typescript-eslint/no-floating-promises`** - Toujours attendre les Promises
- ❌ **`@typescript-eslint/strict-boolean-expressions`** - Expressions booléennes strictes

#### React Rules
- ❌ **`react-hooks/exhaustive-deps`** - Dependencies complètes dans les hooks
- ❌ **`react/no-unescaped-entities`** - Échapper les entités HTML
- ❌ **`react/jsx-key`** - Keys obligatoires dans les listes

#### Security Rules
- ❌ **`no-eval`, `no-new-func`** - Interdiction d'exécution de code dynamique
- ❌ **`no-script-url`** - Pas d'URLs javascript:

### 3. VS Code Integration

**Fichiers**: `.vscode/settings.json`, `.vscode/tasks.json`, `.vscode/extensions.json`

#### Auto-detection en temps réel :
- **ESLint** : Erreurs soulignées pendant la saisie
- **TypeScript** : Vérification de types instantanée
- **Error Lens** : Affichage des erreurs inline
- **Auto-fix** : Correction automatique à la sauvegarde

#### Extensions recommandées :
- `dbaeumer.vscode-eslint` - ESLint integration
- `usernamehw.errorlens` - Inline error display
- `ms-vscode.vscode-typescript-next` - TypeScript avancé
- `esbenp.prettier-vscode` - Code formatting

### 4. GitHub Actions CI/CD

**Fichier**: `.github/workflows/ci.yml`

Pipeline CI automatique qui vérifie :
- ✅ **Type Check** : `pnpm run type-check`
- ✅ **Linting** : `pnpm run lint`
- ✅ **Build** : `pnpm run build`
- ✅ **Security Audit** : `pnpm audit`

### 5. Git Hooks (Husky)

**Fichier**: `.husky/pre-commit`

Vérifications automatiques avant chaque commit :
- Type checking complet
- Linting avec auto-fix
- Formatting avec Prettier

## 🚀 Scripts Disponibles

```bash
# Vérification de types
pnpm run type-check           # Vérification unique
pnpm run type-check:watch     # Mode watch continu

# Linting
pnpm run lint                 # Vérification des règles
pnpm run lint:fix             # Correction automatique

# Vérifications complètes
pnpm run check-all            # Type check + Lint
pnpm run ci                   # Simulation pipeline CI
```

## 🎨 Prettier Configuration

**Fichiers**: `.prettierrc`, `.prettierignore`

Formatage automatique du code avec :
- Single quotes, semicolons
- 100 caractères par ligne
- Trailing commas ES5
- Bracket spacing

## 📊 Monitoring d'Erreurs

### Dans VS Code
- **Problems Panel** : Toutes les erreurs centralisées
- **Error Lens** : Erreurs affichées inline
- **TypeScript Inlay Hints** : Types affichés automatiquement

### En ligne de commande
- **TypeScript** : `pnpm run type-check` - 0 erreur = ✅
- **ESLint** : `pnpm run lint` - 0 warning/error = ✅

### Dans CI/CD
- **GitHub Actions** : Échec automatique si erreurs détectées
- **Branch Protection** : Merge bloqué si CI échoue

## 🔧 Personnalisation

### Ajouter une règle ESLint
Éditez `.eslintrc.json` dans la section `"rules"` :

```json
{
  "rules": {
    "your-custom-rule": "error"
  }
}
```

### Modifier la config TypeScript
Éditez `tsconfig.json` dans `"compilerOptions"` :

```json
{
  "compilerOptions": {
    "yourOption": true
  }
}
```

### Désactiver une règle temporairement
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response;
```

## ✅ Résultat Final

- **0 erreur TypeScript** en production
- **0 warning ESLint** dans le code
- **Détection automatique** des erreurs pendant le développement
- **Qualité code** garantie par CI/CD
- **Developer Experience** optimisée avec VS Code

Cette configuration garantit un code robuste, maintenable et sans erreurs de type en production, tout en maintenant une excellente expérience développeur.