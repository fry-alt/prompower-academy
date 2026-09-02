import { getTranslations } from 'next-intl/server';

export default async function SandboxLoading() {
  const t = await getTranslations('sandbox');
  return (
    <div className="grid h-dvh place-items-center bg-surface-0 text-sm text-ink-faint">
      {t('loading')}
    </div>
  );
}
