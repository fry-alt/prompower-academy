'use client';

import { useTranslations } from 'next-intl';

export default function SandboxError({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations('sandbox');
  return (
    <div role="alert" className="grid h-dvh place-items-center bg-surface-0 p-6">
      <div className="max-w-md">
        <h1 className="text-sm font-medium text-warn">{t('loadFailedTitle')}</h1>
        <pre className="mt-3 overflow-x-auto rounded-panel border border-line bg-surface-1 p-3 font-mono text-xs text-ink-faint">
          {error.message}
        </pre>
      </div>
    </div>
  );
}
