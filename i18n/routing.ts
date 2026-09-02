import { defineRouting } from 'next-intl/routing';

/**
 * Русский — основной. Английский заложен с первого дня: у JAKA международная
 * сеть дистрибьюторов, переделывать потом дороже (§10 брифа).
 */
export const routing = defineRouting({
  locales: ['ru', 'en'],
  defaultLocale: 'ru',
});

export type Locale = (typeof routing.locales)[number];
