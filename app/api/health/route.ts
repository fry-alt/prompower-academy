/**
 * Проверка живости для Docker и выкладки: отвечает, пока сервер принимает
 * запросы. Состояние не читает — базы пока нет (фаза 3).
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ ok: true });
}
