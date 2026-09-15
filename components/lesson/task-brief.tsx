'use client';

import { useTranslations } from 'next-intl';
import { earnedHints, type CheckResult, type Goal, type Task } from '@prompower/sim-core';

/**
 * Условие задания: цели, отметки взятых, вердикт и заслуженные подсказки.
 *
 * Общее для обоих видов уроков. Программный передаёт результат прогона,
 * ручной — отметки целей, которые ученик берёт по ходу.
 */
export function TaskBrief({
  task,
  check,
  error,
  taken,
  activeFailure = null,
  violation = null,
  failedAttempts,
}: {
  task: Task;
  /** Итог автопроверки. `null` — проверять ещё нечего. */
  check: CheckResult | null;
  /** Ошибка исполнения программы. В ручном уроке её не бывает. */
  error: string | null;
  /** Отметки взятых целей. Пустой массив — отметок нет (программный урок). */
  taken: readonly boolean[];
  /**
   * Чего не хватает цели, над которой работают прямо сейчас.
   *
   * Живая подсказка ручного урока: расстояние до точки и градусы до позы
   * пересчитываются на каждое движение ползунка и видны сразу. В программном
   * уроке её нет — там то же самое приходит вердиктом после прогона.
   */
  activeFailure?: string | null;
  /**
   * Нарушенный запрет. Не провал цели, а состояние, которое надо снять, —
   * поэтому показывается отдельно и до вердикта.
   */
  violation?: string | null;
  failedAttempts: number;
}) {
  const t = useTranslations('lesson');

  return (
    <>
      <section>
        <h2 className="mb-2 text-sm font-medium">{t('goals')}</h2>
        <ul className="flex flex-col gap-1 text-sm text-ink-dim">
          {task.goals.map((goal, index) => (
            <li
              key={index}
              data-goal={index}
              data-goal-status={taken[index] === true ? 'taken' : 'pending'}
              className="flex items-baseline gap-2"
            >
              {taken.length > 0 && (
                <span
                  aria-label={taken[index] === true ? t('goalDone') : undefined}
                  className={taken[index] === true ? 'text-ok' : 'text-ink-faint'}
                >
                  {taken[index] === true ? '✓' : '•'}
                </span>
              )}
              <span className={taken[index] === true ? 'text-ink' : undefined}>
                {goalText(goal, t)}
              </span>
            </li>
          ))}
        </ul>

        {activeFailure !== null && (
          <p data-testid="goal-note" className="mt-2 text-sm text-ink-faint">
            {activeFailure}
          </p>
        )}
      </section>

      {violation !== null && (
        <div
          data-testid="violation"
          role="status"
          className="mt-3 rounded-panel border-l-2 border-warn bg-surface-1 p-3 text-sm text-warn"
        >
          <p className="mb-1 font-medium">{t('violation')}</p>
          <p>{violation}</p>
        </div>
      )}

      <Verdict check={check} error={error} t={t} />
      <Hints task={task} failedAttempts={failedAttempts} t={t} />
    </>
  );
}

/** Условие цели по-русски. Switch, а не цепочка вопросов: целей будет больше. */
function goalText(goal: Goal, t: ReturnType<typeof useTranslations<'lesson'>>): string {
  switch (goal.type) {
    case 'objectInZone':
      return t('goal.objectInZone', { object: goal.object, zone: goal.zone });
    case 'gripperState':
      return t('goal.gripperState', { state: t(`gripper.${goal.state}`) });
    case 'pointsVisited':
      return t('goal.pointsVisited', { count: goal.points.length });
    case 'jointsAtPose':
      return t('goal.jointsAtPose');
    case 'flangeAtPoint':
      return t('goal.flangeAtPoint');
  }
}

/**
 * Лестница подсказок урока.
 *
 * Ступени открываются неудачными попытками и остаются на экране: открывшаяся
 * вторая подсказка не отменяет первую. Пока ни одна не заслужена, раздела нет —
 * обещание «здесь появятся подсказки» ученику ничего не даёт.
 */
function Hints({
  task,
  failedAttempts,
  t,
}: {
  task: Task;
  failedAttempts: number;
  t: ReturnType<typeof useTranslations<'lesson'>>;
}) {
  const hints = earnedHints(task, failedAttempts);
  if (hints.length === 0) return null;

  return (
    <section data-testid="hints" className="mt-4">
      <h2 className="mb-2 text-sm font-medium">{t('hints.title')}</h2>

      <ol className="flex flex-col gap-2">
        {hints.map((hint) => (
          <li
            key={hint.afterFailedAttempts}
            data-testid="hint"
            className="rounded-panel border-l-2 border-brand/60 bg-surface-1 p-3 text-sm text-ink-dim"
          >
            {hint.text}
          </li>
        ))}
      </ol>

      {hints.length < task.hints.length && (
        <p className="mt-2 text-xs text-ink-faint">{t('hints.next')}</p>
      )}
    </section>
  );
}

/** Итог задания: ошибка исполнения либо результат автопроверки. */
function Verdict({
  check,
  error,
  t,
}: {
  check: CheckResult | null;
  error: string | null;
  t: ReturnType<typeof useTranslations<'lesson'>>;
}) {
  if (error !== null) {
    return (
      <p data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-warn">
        {error}
      </p>
    );
  }

  if (check === null) return null;

  if (check.passed) {
    return (
      <p data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-ok">
        {t('passed')}
      </p>
    );
  }

  return (
    <div data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-warn">
      <p className="mb-1 font-medium">{t('failed')}</p>
      <ul className="flex flex-col gap-1">
        {check.failures.map((failure) => (
          <li key={failure}>{failure}</li>
        ))}
      </ul>
    </div>
  );
}
