import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Статику, модели роботов и служебные пути локаль не касается.
  matcher: '/((?!api|_next|_vercel|models|.*\..*).*)',
};
