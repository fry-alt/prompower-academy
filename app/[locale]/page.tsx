import { redirect } from '@/i18n/navigation';

/**
 * Лендинг появится в фазе 3. Пока единственная готовая страница — песочница
 * симулятора, на неё и уводим.
 */
export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/sandbox', locale });
}
