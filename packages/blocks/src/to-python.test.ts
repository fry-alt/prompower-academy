import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Program, Value } from '@prompower/sim-core';
import { toPython } from './to-python';

function program(...body: Program['body']): Program {
  return { version: 1, body };
}

const MOVE = { speed: 0.5, acc: 0.5 } as const;

describe('шапка скрипта', () => {
  it('подключается к контроллеру и включает робота', () => {
    const code = toPython(program());

    expect(code).toContain('import jkrc');
    expect(code).toContain('robot = jkrc.RC("192.168.1.100")');
    expect(code).toContain('robot.login()');
    expect(code).toContain('robot.enable_robot()');
  });

  it('адрес контроллера подставляется', () => {
    expect(toPython(program(), { host: '10.0.0.5' })).toContain('jkrc.RC("10.0.0.5")');
  });

  it('всегда выключает робота в finally', () => {
    // Иначе оборванный скрипт оставит робота под напряжением.
    const code = toPython(program());
    expect(code).toContain('finally:');
    expect(code).toContain('robot.disable_robot()');
    expect(code).toContain('robot.logout()');
  });

  it('пустая программа остаётся синтаксически верной', () => {
    expect(toPython(program())).toMatch(/try:[\s\S]*pass[\s\S]*finally:/);
  });

  it('import time появляется только там, где есть ожидание', () => {
    expect(toPython(program({ op: 'comment', text: 'нет ожидания' }))).not.toContain('import time');
    expect(toPython(program({ op: 'wait', ms: 500 }))).toContain('import time');
  });

  it('находит ожидание внутри цикла', () => {
    const nested = program({ op: 'repeat', times: 2, body: [{ op: 'wait', ms: 100 }] });
    expect(toPython(nested)).toContain('import time');
  });
});

describe('движения', () => {
  it('moveJ выдаёт углы в радианах', () => {
    const code = toPython(program({ op: 'moveJ', joints: [0, 1.5708, 0, 0, 0, 0], ...MOVE }));
    expect(code).toContain('robot.joint_move([0.000000, 1.570800, 0.000000, 0.000000, 0.000000, 0.000000]');
  });

  it('moveL переводит метры в миллиметры', () => {
    const pose = { x: 0.35, y: -0.2, z: 0.06, rx: Math.PI, ry: 0, rz: 0 };
    const code = toPython(program({ op: 'moveL', pose, ...MOVE }));

    // 0.35 м = 350 мм, ориентация остаётся в радианах.
    expect(code).toContain('robot.linear_move([350.000, -200.000, 60.000, 3.141593, 0.000000, 0.000000]');
  });

  it('доля скорости превращается в паспортные единицы', () => {
    const code = toPython(program({ op: 'moveJ', joints: [0, 0, 0, 0, 0, 0], speed: 0.5, acc: 1 }), {
      maxJointSpeed: 4,
    });
    expect(code).toContain(', 2.000)');
  });
});

describe('ввод-вывод и захват', () => {
  it('различает банк шкафа и банк инструмента', () => {
    const cabinet = toPython(program({ op: 'setDO', bank: 'cabinet', index: 3, value: true }));
    const tool = toPython(program({ op: 'setDO', bank: 'tool', index: 1, value: false }));

    expect(cabinet).toContain('robot.set_digital_output(IO_CABINET, 3, 1)');
    expect(tool).toContain('robot.set_digital_output(IO_TOOL, 1, 0)');
  });

  it('захват разворачивается в выход инструмента', () => {
    // В JAKA Zu App отдельного блока захвата нет — он висит на выходе.
    const code = toPython(program({ op: 'gripper', action: 'close' }), { gripperOutput: 2 });
    expect(code).toContain('robot.set_digital_output(IO_TOOL, 2, 1)');
  });

  it('ожидание входа крутит опрос до нужного состояния', () => {
    const code = toPython(program({ op: 'waitDI', bank: 'cabinet', index: 1, value: true }));
    expect(code).toContain('while _input(IO_CABINET, 1) != 1:');
    expect(code).toContain('time.sleep(0.01)');
  });
});

describe('управляющие конструкции', () => {
  it('цикл с телом', () => {
    const code = toPython(
      program({ op: 'repeat', times: 3, body: [{ op: 'gripper', action: 'open' }] }),
    );
    expect(code).toContain('    for _ in range(3):');
    expect(code).toContain('        _check(robot.set_digital_output(IO_TOOL, 1, 0)');
  });

  it('пустое тело цикла получает pass', () => {
    expect(toPython(program({ op: 'repeat', times: 2, body: [] }))).toMatch(/range\(2\):\n\s+pass/);
  });

  it('ветвление с else', () => {
    const code = toPython(
      program({
        op: 'if',
        cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: true },
        then: [{ op: 'wait', ms: 100 }],
        else: [{ op: 'wait', ms: 200 }],
      }),
    );

    expect(code).toContain('if _input(IO_CABINET, 1) == 1:');
    expect(code).toContain('    else:');
  });

  it('составное условие расставляет скобки', () => {
    const code = toPython(
      program({
        op: 'while',
        cond: {
          kind: 'and',
          left: { kind: 'digitalInput', bank: 'tool', index: 1, value: true },
          right: {
            kind: 'not',
            operand: {
              kind: 'compare',
              operator: '<',
              left: { kind: 'variable', name: 'счётчик' },
              right: { kind: 'number', value: 5 },
            },
          },
        },
        body: [],
      }),
    );

    expect(code).toContain('and');
    expect(code).toContain('not (');
  });
});

describe('переменные', () => {
  it('русские имена переводятся в латиницу', () => {
    const code = toPython(
      program({ op: 'setVar', name: 'счётчик', value: { kind: 'number', value: 0 } }),
    );
    expect(code).toContain('schetchik = 0');
  });

  it('одно и то же имя переводится одинаково в присваивании и в выражении', () => {
    const code = toPython(
      program({
        op: 'setVar',
        name: 'счётчик',
        value: {
          kind: 'binary',
          operator: '+',
          left: { kind: 'variable', name: 'счётчик' },
          right: { kind: 'number', value: 1 },
        },
      }),
    );
    expect(code).toContain('schetchik = (schetchik + 1)');
  });

  it('имя, начинающееся с цифры, получает приставку', () => {
    const code = toPython(
      program({ op: 'setVar', name: '1деталь', value: { kind: 'number', value: 1 } }),
    );
    expect(code).toMatch(/^\s*var_1detal = 1$/m);
  });
});

describe('отступы', () => {
  it('вложенность отражается отступами по четыре пробела', () => {
    const code = toPython(
      program({
        op: 'repeat',
        times: 2,
        body: [{ op: 'repeat', times: 3, body: [{ op: 'wait', ms: 10 }] }],
      }),
    );

    expect(code).toContain('    for _ in range(2):');
    expect(code).toContain('        for _ in range(3):');
    expect(code).toContain('            time.sleep(0.01)');
  });
});

describe('вычисляемые координаты', () => {
  const computed = (y: Value): string =>
    toPython(
      program(
        { op: 'setVar', name: 'y', value: { kind: 'number', value: -100 } },
        { op: 'moveL', pose: { x: 0.45, y, z: 0.22, rx: Math.PI, ry: 0, rz: 0 }, ...MOVE },
      ),
    );

  it('переменная попадает в скрипт под своим именем', () => {
    const code = computed({
      kind: 'binary',
      operator: '/',
      left: { kind: 'variable', name: 'y' },
      right: { kind: 'number', value: 1000 },
    });

    // Деление на тысячу сокращается с обратным умножением: SDK принимает
    // миллиметры, и в файле стоит ровно то, что собрал ученик.
    expect(code).toContain('y = -100');
    expect(code).toMatch(/linear_move\(\[450\.000, y, 220\.000/);
    expect(code).not.toContain('/ 1000');
  });

  it('выражение без деления печатается с переводом в миллиметры', () => {
    const code = computed({ kind: 'variable', name: 'y' });
    expect(code).toMatch(/\(y\) \* 1000/);
  });
});

describe('скрипт исполним без правок', () => {
  it('объявляет константы SDK сам: в модуле jkrc их нет', () => {
    const code = toPython(program({ op: 'moveJ', joints: [0, 0, 0, 0, 0, 0], ...MOVE }));

    expect(code).toMatch(/^ABS = 0$/m);
    expect(code).toMatch(/^IO_CABINET = 0$/m);
    expect(code).toMatch(/^IO_TOOL = 1$/m);
    expect(code).toContain('ABS, True,');
  });

  it('проверяет код возврата каждого вызова SDK', () => {
    const code = toPython(program({ op: 'gripper', action: 'close' }));
    expect(code).toContain('_check(robot.login(), "вход в контроллер")');
    expect(code).toContain('_check(robot.set_digital_output(IO_TOOL, 1, 1), "захват")');
  });

  it('таймаут ожидания входа исполняется, а не висит комментарием', () => {
    const code = toPython(
      program({ op: 'waitDI', bank: 'cabinet', index: 2, value: true, timeoutMs: 1500 }),
    );

    expect(code).toContain('_deadline = time.monotonic() + 1.5');
    expect(code).toContain('raise TimeoutError(');
  });

  it('переменные заводятся нулём до программы, как в симуляторе', () => {
    const code = toPython(
      program({
        op: 'if',
        cond: {
          kind: 'compare',
          operator: '<',
          left: { kind: 'variable', name: 'n' },
          right: { kind: 'number', value: 3 },
        },
        then: [],
      }),
    );

    expect(code).toMatch(/^ {4}n = 0$/m);
  });

  it('имя переменной не затирает робота и слова языка', () => {
    const code = toPython(
      program(
        { op: 'setVar', name: 'robot', value: { kind: 'number', value: 1 } },
        { op: 'setVar', name: 'for', value: { kind: 'number', value: 2 } },
      ),
    );

    expect(code).toContain('robot_var = 1');
    expect(code).toContain('for_var = 2');
  });

  it('разные имена не сливаются после транслитерации', () => {
    const code = toPython(
      program(
        { op: 'setVar', name: 'Ряд', value: { kind: 'number', value: 1 } },
        { op: 'setVar', name: 'ряд', value: { kind: 'number', value: 2 } },
      ),
    );

    expect(code).toContain('ryad = 1');
    expect(code).toContain('ryad_2 = 2');
  });

  it('перенос строки в комментарии не превращается в код', () => {
    const code = toPython(program({ op: 'comment', text: 'раз\nrobot.power_off()' }));
    expect(code).toContain('# раз robot.power_off()');
    expect(code).not.toMatch(/^\s*robot\.power_off\(\)/m);
  });

  it('деление идёт через помощника: на ноль даёт ноль, как в симуляторе', () => {
    const code = toPython(
      program({
        op: 'setVar',
        name: 'k',
        value: {
          kind: 'binary',
          operator: '/',
          left: { kind: 'number', value: 1 },
          right: { kind: 'variable', name: 'n' },
        },
      }),
    );

    expect(code).toContain('def _div(a, b):');
    expect(code).toContain('k = _div(1, n)');
  });

  // Сильнейшая проверка: настоящий интерпретатор Python исполняет скрипт против
  // подставного модуля jkrc. Без Python на машине тест пропускается.
  it.skipIf(!hasPython())('исполняется интерпретатором Python против подставного SDK', () => {
    const code = toPython(
      program(
        { op: 'setVar', name: 'i', value: { kind: 'number', value: 0 } },
        {
          op: 'repeat',
          times: 2,
          body: [
            { op: 'waitDI', bank: 'cabinet', index: 1, value: true, timeoutMs: 1000 },
            { op: 'moveJ', joints: [0, 0.5, 0, 0, 0, 0], ...MOVE },
            {
              op: 'moveL',
              pose: {
                x: 0.4,
                y: {
                  kind: 'binary',
                  operator: '/',
                  left: { kind: 'variable', name: 'i' },
                  right: { kind: 'number', value: 1000 },
                },
                z: 0.2,
                rx: Math.PI,
                ry: 0,
                rz: 0,
              },
              ...MOVE,
            },
            { op: 'gripper', action: 'close' },
            { op: 'wait', ms: 10 },
            {
              op: 'setVar',
              name: 'i',
              value: {
                kind: 'binary',
                operator: '+',
                left: { kind: 'variable', name: 'i' },
                right: { kind: 'number', value: 100 },
              },
            },
          ],
        },
      ),
    );

    const result = runPython(code);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('joint_move');
    expect(result.stdout).toContain('linear_move [400.0, 100, 200.0');
  });
});

const FAKE_JKRC = `
class RC:
    def __init__(self, host):
        pass
    def __getattr__(self, name):
        def call(*args):
            print(name, *args)
            return (0, 1) if name == "get_digital_input" else (0,)
        return call
`;

function hasPython(): boolean {
  return spawnSync('python', ['--version']).status === 0;
}

function runPython(code: string): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'jkrc-'));
  writeFileSync(join(dir, 'jkrc.py'), FAKE_JKRC);
  writeFileSync(join(dir, 'program.py'), code);

  const result = spawnSync('python', ['program.py'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
