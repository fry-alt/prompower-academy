'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { PythonOptions } from '@prompower/blocks';
import { useTranslations } from 'next-intl';
import { LessonHeader } from '@/components/lesson/lesson-header';
import { LessonNav, type LessonLink } from '@/components/lesson/lesson-nav';
import { LessonBrief, LessonShell } from '@/components/lesson/lesson-shell';
import { TaskBrief } from '@/components/lesson/task-brief';
import { TaskOnDesktop } from '@/components/lesson/task-on-desktop';
import { TheoryView } from '@/components/lesson/theory-view';
import { useWideEnough } from '@/components/lesson/use-wide-enough';
import type { Tour } from '@/lib/tour';
import {
  alignToolDown,
  digitalInput,
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
import { JogLesson } from './jog-lesson';
import { ProgramPanel } from './program-panel';
import { TeachPanel, type TeachNote } from './teach-panel';
import { RobotViewer } from './robot-viewer';
import { SplitPane } from './split-pane';
import { RunControls } from './run-controls';
import { SceneObjects } from './scene-objects';
import { useProgramRun } from './use-program-run';
import { useUrdfRobot } from './use-urdf-robot';
import { useUrdfChain } from './use-urdf-chain';
import { taskBounds } from './task-bounds';

/**
 * Экран задания: условие, программа и сцена — три зоны из §9 брифа.
 */
const EMPTY: Program = { version: 1, body: [] };

interface LessonProps {
  plugin: RobotPlugin;
  task: Task;
  /** Сценарий обучения: подсветка кнопок. Урок без него — обычное дело. */
  tour: Tour | null;
  starter: object;
  /** Заголовок урока из содержания: шапке нужна строка, а не готовый узел. */
  title: string;
  /** Теория собрана на сервере и приходит готовым узлом. */
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
}

/**
 * Урок целиком. Ширина окна решает, что вообще собирать.
 *
 * Развилка сделана компонентами, а не веткой в разметке, ради загрузок: на
 * телефоне блочный редактор бесполезен (§9 брифа), и туда не должны уезжать ни
 * модель робота, ни сцена. Ветка внутри одного компонента их бы всё равно
 * запросила — хуки грузят по монтированию, а не по показу.
 */
export function LessonWorkspace(props: LessonProps) {
  return useWideEnough() ? <WideLesson {...props} /> : <NarrowLesson {...props} />;
}

/** Урок на телефоне: теория читается, задание честно отсылает к компьютеру. */
function NarrowLesson({ plugin, title, theory, previous, next }: LessonProps) {
  const tKey = useTranslations();
  const [reading, setReading] = useState(true);

  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <LessonHeader title={title} model={tKey(plugin.displayNameKey)} />

      {reading ? (
        <>
          <TheoryView onStart={() => setReading(false)}>{theory}</TheoryView>
          <div className="border-t border-line px-5 py-3">
            <LessonNav previous={previous} next={next} />
          </div>
        </>
      ) : (
        <TaskOnDesktop onBack={() => setReading(true)} />
      )}
    </div>
  );
}

function WideLesson({ plugin, task, tour, starter, title, theory, previous, next }: LessonProps) {
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

  // Ручное задание собирается своим экраном: программы в нём нет, и хук
  // прогона поднимать незачем.
  if (task.mode === 'jog') {
    return (
      <JogLesson
        plugin={plugin}
        task={task}
        tour={tour}
        title={title}
        theory={theory}
        previous={previous}
        next={next}
        robot={model.robot}
        chain={chain.chain}
        bounds={model.bounds}
        loadMs={model.loadMs}
        fps={fps}
        onFps={setFps}
      />
    );
  }

  return (
    <Workspace
      plugin={plugin}
      task={task}
      tour={tour}
      starter={starter}
      title={title}
      theory={theory}
      previous={previous}
      next={next}
      model={model}
      chain={chain.chain}
      fps={fps}
      onFps={setFps}
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
  tour,
  starter,
  title,
  theory,
  previous,
  next,
  model,
  chain,
  fps,
  onFps,
}: {
  plugin: RobotPlugin;
  task: Task;
  tour: Tour | null;
  starter: object;
  title: string;
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
  model: Loaded;
  chain: Chain;
  fps: number;
  onFps: (value: number) => void;
}) {
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

  // Скорость суставов в скрипте — из URDF модели, а не константа: самый
  // медленный сустав задаёт потолок, который выдержат все.
  const python = useMemo<PythonOptions>(() => {
    const speeds = chain.joints.map((joint) => joint.maxSpeed).filter((value) => value > 0);
    return speeds.length > 0 ? { maxJointSpeed: Math.min(...speeds) } : {};
  }, [chain]);

  // Датчик светится по своему входу, а не по собственной проверке «есть ли
  // деталь перед ним»: второй такой расчёт разошёлся бы с миром молча.
  const sensorOn = useMemo(() => {
    const { world } = runner.run;
    return Object.fromEntries(
      Object.values(world.sensors).map((sensor) => [
        sensor.id,
        digitalInput(world, sensor.bank, sensor.channel) === true,
      ]),
    );
  }, [runner.run]);

  // Кадр строится по роботу вместе с деталями, зонами и метками целей: иначе
  // задание окажется за краем экрана, а ученику надо видеть, куда он
  // перекладывает деталь.
  const bounds = useMemo(() => taskBounds(model.bounds, task), [model.bounds, task]);

  return (
    <LessonShell
      plugin={plugin}
      title={title}
      theory={theory}
      previous={previous}
      next={next}
      tour={tour}
      passed={runner.check?.passed === true && runner.status === 'done'}
      program={program}
      loadMs={model.loadMs}
      fps={fps}
      controls={
        <RunControls
          locked={teaching !== null || programError !== null}
          status={runner.status}
          speed={runner.speed}
          onPlay={runner.play}
          onPause={runner.pause}
          onStep={runner.stepOnce}
          onReset={runner.reset}
          onSpeed={runner.setSpeed}
        />
      }
      left={
        <>
          <LessonBrief>
            {teaching === null ? (
              <TaskBrief
                task={task}
                check={runner.status === 'done' ? runner.check : null}
                error={runner.run.error}
                taken={[]}
                failedAttempts={runner.failedAttempts}
              />
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
          </LessonBrief>

          {/*
            Редактор остаётся смонтированным и во время показа точки.
            Размонтировать его нельзя: показанная поза возвращается в блок
            замыканием на объект Blockly, а вместе с редактором умирает и
            рабочая область — запись уходит в никуда, и поза теряется молча.
          */}
          <div className="flex min-h-0 flex-1 flex-col">
            <ProgramPanel
              program={program}
              starter={starter}
              current={runner.run.current}
              error={programError}
              fileName={`${task.id}.py`}
              draftKey={`prompower:draft:v1:${task.id}`}
              python={python}
              onProgram={onProgram}
              onTeach={startTeaching}
            />
          </div>
        </>
      }
      viewer={
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
            conveyors={runner.run.world.conveyors}
            sensors={runner.run.world.sensors}
            sensorOn={sensorOn}
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
      }
    />
  );
}

