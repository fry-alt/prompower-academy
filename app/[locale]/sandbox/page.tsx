import { defaultRobotId } from '@prompower/robot-plugins';
import { redirect } from '@/i18n/navigation';

/** Адрес без модели уводит на модель по умолчанию: пустой песочницы не бывает. */
export default async function SandboxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: `/sandbox/${defaultRobotId}`, locale });
}
