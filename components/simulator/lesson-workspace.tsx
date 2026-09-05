'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LessonNav, type LessonLink } from '@/components/lesson/lesson-nav';
import {
  alignToolDown,
  jogPose,
  jogToPose,
  type JogAxis,
  type JogFrame,
  type JogResult,
  type Pose,
  type Program,
  type RobotPlugin,
  type Task,
} from '@prompower/sim-core';
import {
  fieldsFromJoints,
  seedJoints,
  teachKindOf,
  type TeachFields,
  type TeachKind,
} from '@prompower/blocks';
import { BaseTriad, FlangeTriad } from './axes-triad';
import { useAnimatedJoints } from './use-animated-joints';
import type { TeachRequest } from './block-editor';
import { GhostRobot } from './ghost-robot';
import { ProgramPanel } from './program-panel';
import { TeachPanel, type TeachNote } from './teach-panel';
import { RobotViewer } from './robot-viewer';
import { RunControls } from './run-controls';
import { SceneObjects } from './scene-objects';
import { useProgramRun } from './use-program-run';
import { useUrdfRobot } from './use-urdf-robot';
import { useUrdfChain } from './use-urdf-chain';
import { includeScene } from './fit-robot';

/**
 * Экран задания: условие, программа и сцена.
 *
 * Три зоны из §9 брифа, но пока без редактора блоков: программа приходит готовой
 * и показана списком. Когда появится Blockly, он встанет на место списка — всё
 * остальное уже работает от него независимо.
 */
const EMPTY: Program = { version: 1, body: [] };

export function LessonWorkspace({
  plugin,
  task,
  starter,
  theory,
  previous,
  next,
}: {
  plugin: RobotPlugin;
  task: Task;
  starter: object;
  /** Теория собрана на сервере и приходит готовым узлом. */
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
}) {
  const t = useTranslations('lesson');
  const tKey = useTranslations();
  const [fps, setFps] = useState(0);

  const model = useUrdfRobot(plugin);
  const chain = useUrdfChain(plugin);

  if (model.status === 'error' || chain.status === 'error') {
    const error = model.status === 'error' ? model.error : (chain as { error: Error }).error;
    return (
      <p data-testid="load-failure" className="p-5 text-sm text-warn">
        {t('loadFailed', { reason: error.message })}
      </p>
    );
  }

  if (model.status === 'loading' || chain.status === 'loading') {
    return <p className="p-5 text-sm text-ink-faint">{t('loading')}</p>;
  }

  return (
    <Workspace
      plugin={plugin}
      task={task}
      starter={starter}
      theory={theory}
      previous={previous}
      next={next}
      model={model}
      chain={chain.chain}
      fps={fps}
      onFps={setFps}
      labels={{ t, tKey }}
    />
  );
}

type Loaded = Extract<ReturnType<typeof useUrdfRobot>, { status: 'ready' }>;
type Chain = Extract<ReturnType<typeof useUrdfChain>, { status: 'ready' }>['chain'];

/** Блок, которому сейчас показывают точку, и поза серой копии. */
interface Teaching {
  readonly kind: TeachKind;
  readonly joints: readonly number[];
  readonly note: TeachNote;
  /** Куда вернуть показанное: замыкание на тот самый блок в редакторе. */
  readonly write: (fields: TeachFields) => void;
}

/**
 * Внутренний компонент нужен, чтобы хук прогона вызывался только с готовой
 * цепью: хуки нельзя звать условно, а цепь приходит асинхронно.
 */
function Workspace({
  plugin,
  task,
  starter,
  theory,
  previous,
  next,
  model,
  chain,
  fps,
  onFps,
  labels,
}: {
  plugin: RobotPlugin;
  task: Task;
  starter: object;
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
  model: Loaded;
  chain: Chain;
  fps: number;
  onFps: (value: number) => void;
  labels: { t: ReturnType<typeof useTranslations<'lesson'>>; tKey: ReturnType<typeof useTranslations> };
}) {
  const { t, tKey } = labels;

  // Программа приходит из редактора блоков и меняется по ходу сборки.
  const [program, setProgram] = useState<Program>(EMPTY);
  const [programError, setProgramError] = useState<string | null>(null);

  const onProgram = useCallback((next: Program, error: string | null) => {
    setProgram(next);
    setProgramError(error);
  }, []);

  const runner = useProgramRun(chain, program, task, plugin.homePose);

  const [teaching, setTeaching] = useState<Teaching | null>(null);

  // Копия едет к целевой позе, а панель показывает саму цель: числовые поля
  // неуправляемые и перемонтируются по `key`, так что шестьдесят обновлений в
  // секунду сделали бы их непечатаемыми.
  const shownJoints = useAnimatedJoints(teaching?.joints ?? null);

  const startTeaching = (request: TeachRequest): void => {
    const kind = teachKindOf(request.blockType);
    if (kind === null) return;

    // Показывать точку на ходу нельзя: копия и робот разъедутся на глазах.
    runner.pause();

    const seed = seedJoints(kind, request.fields, chain, runner.joints);
    setTeaching({ kind, joints: seed.joints, note: seed.note, write: request.write });
  };

  const saveTeaching = (): void => {
    if (teaching === null) return;
    teaching.write(fieldsFromJoints(teaching.kind, teaching.joints, chain));
    setTeaching(null);
  };

  const moveTeaching = (index: number, radians: number): void => {
    setTeaching((current) =>
      current === null
        ? null
        : {
            ...current,
            joints: current.joints.map((value, i) => (i === index ? radians : value)),
            // Копия уже там, куда её привели: прежняя оговорка про записанную
            // точку с этого момента неверна.
            note: 'ok',
          },
    );
  };

  /**
   * Общая часть подвода: удавшийся шаг ложится в позу, неудавшийся оставляет
   * копию на месте и меняет только оговорку.
   */
  const applyJog = (compute: (joints: readonly number[]) => JogResult): boolean => {
    if (teaching === null) return false;

    const result = compute(teaching.joints);
    // Копия уже там, куда её привели: прежняя оговорка с этого момента неверна.
    setTeaching(
      result.ok
        ? { ...teaching, joints: result.joints, note: 'ok' }
        : { ...teaching, note: 'blocked' },
    );

    return result.ok;
  };

  /**
   * Обновляющая функция здесь не годится: удержанию надо знать прямо сейчас,
   * удался ли шаг, а изнутри неё исход не вернуть. Замыкание при этом свежее —
   * хук удержания зовёт то, что пришло последним рендером.
   */
  const jogTeaching = (frame: JogFrame, axis: JogAxis, delta: number): boolean =>
    applyJog((joints) => jogPose(chain, joints, frame, axis, delta));

  const poseTeaching = (pose: Pose): void => {
    applyJog((joints) => jogToPose(chain, joints, pose));
  };

  const alignTeaching = (): void => {
    applyJog((joints) => alignToolDown(chain, joints));
  };

  const jointNames = useMemo(() => plugin.joints.map((joint) => joint.urdfName), [plugin]);

  // Кадр строится по роботу вместе с деталями и зонами: иначе задание окажется
  // за краем экрана, а ученику надо видеть, куда он перекладывает деталь.
  const bounds = useMemo(
    () => includeScene(model.bounds, [...task.world.objects, ...task.world.zones]),
    [model.bounds, task],
  );

  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h1 className="text-base font-medium">{t('title')}</h1>
          <p className="text-sm text-ink-dim">{tKey(plugin.displayNameKey)}</p>
        </div>
        <RunControls
          locked={teaching !== null}
          status={runner.status}
          speed={runner.speed}
          onPlay={runner.play}
          onPause={runner.pause}
          onStep={runner.stepOnce}
          onReset={runner.reset}
          onSpeed={runner.setSpeed}
        />
      </header>

      {plugin.placeholderNoticeKey !== null && (
        <p role="status" className="border-b border-line bg-surface-1 px-5 py-2 text-sm text-warn">
          {tKey(plugin.placeholderNoticeKey)}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Ширина поднята с 72 до 80: в 288 пикселях теория читается плохо.
            Настоящее решение — тянущиеся разделители из §9, отдельной работой. */}
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-line p-5 lg:w-80 lg:border-b-0 lg:border-r">
          {theory}

          <hr className="border-line" />

          {teaching === null ? (
            <TaskBrief task={task} runner={runner} t={t} />
          ) : (
            <TeachPanel
              joints={plugin.joints}
              chain={chain}
              values={teaching.joints}
              note={teaching.note}
              onChange={moveTeaching}
              onJog={jogTeaching}
              onPose={poseTeaching}
              onAlignDown={alignTeaching}
              onSave={saveTeaching}
              onCancel={() => setTeaching(null)}
            />
          )}

          <LessonNav previous={previous} next={next} />
        </aside>

        <section className="flex min-h-0 w-full flex-col border-b border-line lg:min-w-[34rem] lg:flex-1 lg:border-b-0 lg:border-r">
          <ProgramPanel
            program={program}
            starter={starter}
            current={runner.run.current}
            error={programError}
            onProgram={onProgram}
            onTeach={startTeaching}
          />
        </section>

        <main className="relative min-h-0 flex-1 lg:min-w-[26rem]">
          <RobotViewer
            robot={model.robot}
            jointNames={jointNames}
            values={runner.joints}
            scene={plugin.scene}
            bounds={bounds}
            onFpsSample={onFps}
          >
            <SceneObjects
              objects={runner.objects}
              zones={runner.run.world.zones}
              heldId={runner.run.world.grasped}
            />

            {teaching !== null && shownJoints !== null && (
              <>
                <GhostRobot source={model.robot} jointNames={jointNames} values={shownJoints} />
                {/* Оси в долях габарита: у Zu 3 и Zu 20 разный масштаб, и стрелка
                    в фиксированных сантиметрах у одного потеряется, у другого
                    закроет сцену. */}
                <FlangeTriad chain={chain} values={shownJoints} size={bounds.radius * 0.25} />
                <BaseTriad size={bounds.radius * 0.25} />
              </>
            )}
          </RobotViewer>

          {/* Виньетка: сцена перестаёт выглядеть вырезанной в пустоте. Делается
              наложением поверх холста, а не в сцене — шейдер ради неё писать
              незачем, а пакет постобработки мы не подключаем. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent_45%,rgba(0,0,0,0.5)_100%)]"
          />

          <p
            data-testid="scene-stats"
            className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs text-ink-faint"
          >
            <span data-testid="load-ms">{model.loadMs}</span> ms · {fps} fps
          </p>
        </main>
      </div>
    </div>
  );
}

/** Условие задания и итог прогона — то, что видно, пока точку не показывают. */
function TaskBrief({
  task,
  runner,
  t,
}: {
  task: Task;
  runner: ReturnType<typeof useProgramRun>;
  t: ReturnType<typeof useTranslations<'lesson'>>;
}) {
  return (
    <>
      <section>
        <h2 className="mb-2 text-sm font-medium">{t('goals')}</h2>
        <ul className="flex flex-col gap-1 text-sm text-ink-dim">
          {task.goals.map((goal, index) => (
            <li key={index}>
              {goal.type === 'objectInZone'
                ? t('goal.objectInZone', { object: goal.object, zone: goal.zone })
                : t('goal.gripperState', { state: t(`gripper.${goal.state}`) })}
            </li>
          ))}
        </ul>
      </section>

      <Verdict runner={runner} t={t} />
    </>
  );
}

/** Итог прогона: ошибка исполнения либо результат автопроверки. */
function Verdict({
  runner,
  t,
}: {
  runner: ReturnType<typeof useProgramRun>;
  t: ReturnType<typeof useTranslations<'lesson'>>;
}) {
  if (runner.run.error !== null) {
    return (
      <p data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-warn">
        {runner.run.error}
      </p>
    );
  }

  if (runner.status !== 'done' || runner.check === null) return null;

  if (runner.check.passed) {
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
        {runner.check.failures.map((failure) => (
          <li key={failure}>{failure}</li>
        ))}
      </ul>
    </div>
  );
}
