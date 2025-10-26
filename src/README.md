# src/ Directory

This directory contains all the core application logic, services, and utilities.

## Structure

```
src/
├── constants/          # Application-wide constants
│   └── Colors.ts       # Theme colors
│
├── hooks/              # Custom React hooks
│   ├── useColorScheme.ts      # Color scheme management
│   ├── useColorScheme.web.ts  # Web-specific color scheme
│   ├── useThemeColor.ts       # Theme color utilities
│   └── useDatabase.ts         # Database operation hooks
│
├── locales/            # i18n translation files
│   ├── en.json         # English
│   ├── es.json         # Spanish
│   ├── fr.json         # French
│   └── ar.json         # Arabic
│
├── services/           # Service layer (business logic)
│   └── database/       # Database service
│       └── index.ts    # SQLite operations
│
├── theme/              # Theme provider
│   └── ThemeProvider.tsx
│
├── types/              # TypeScript type definitions
│   └── database.ts     # Database-related types
│
├── utils/              # Utility functions
│   ├── currency.ts     # Currency formatting and symbols
│   └── helpers.ts      # General helper functions
│
└── db.ts               # Compatibility re-export (use services/database instead)
```

## Usage Examples

### Import from services
```typescript
import { fetchArticles, addArticle } from '@/src/services/database';
```

### Import types
```typescript
import type { Article, Price } from '@/src/types/database';
```

### Import hooks
```typescript
import { useChinaStock, usePrices } from '@/src/hooks/useDatabase';
```

### Import utilities
```typescript
import { formatCurrency, sanitizeInt } from '@/src/utils/helpers';
import { getCurrencySymbol } from '@/src/utils/currency';
```

### Using Path Aliases (Recommended)
```typescript
import { fetchArticles } from '@services/database';
import type { Article } from '@types/database';
import { useChinaStock } from '@hooks/useDatabase';
import { Colors } from '@constants/Colors';
```

## Guidelines

1. **Services** - Business logic and API calls
2. **Hooks** - Reusable stateful logic
3. **Utils** - Pure functions without state
4. **Types** - TypeScript definitions
5. **Constants** - Static configuration values
