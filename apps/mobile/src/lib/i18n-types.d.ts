import 'i18next';

import type { TranslationResource } from '@wayfarer/shared/i18n';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: TranslationResource };
  }
}
