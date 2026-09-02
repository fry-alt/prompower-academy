import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getRobotPlugin, robotPlugins } from '@prompower/robot-plugins';
import { SandboxClient } from './sandbox-client';

export function generateStaticParams() {
  return robotPlugins.map((plugin) => ({ robot: plugin.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; robot: string }>;
}): Promise<Metadata> {
  const { locale, robot } = await params;
  const plugin = getRobotPlugin(robot);
  const t = await getTranslations({ locale });

  if (plugin === undefined) return { title: t('sandbox.title') };
  return {
    title: `${t('sandbox.title')} — ${t(plugin.displayNameKey)}`,
    description: t('sandbox.description'),
  };
}

export default async function RobotSandboxPage({
  params,
}: {
  params: Promise<{ locale: string; robot: string }>;
}) {
  const { locale, robot } = await params;
  setRequestLocale(locale);

  if (getRobotPlugin(robot) === undefined) notFound();
  return <SandboxClient robotId={robot} />;
}
