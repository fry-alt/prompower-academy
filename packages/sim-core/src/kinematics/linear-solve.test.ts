import { describe, expect, it } from 'vitest';
import { solveLinearSystem } from './linear-solve';

function expectSolution(actual: number[] | null, expected: number[]): void {
  expect(actual).not.toBeNull();
  for (const [index, value] of expected.entries()) {
    expect(actual![index]!).toBeCloseTo(value, 9);
  }
}

describe('solveLinearSystem', () => {
  it('решает систему 2×2', () => {
    // 2x + y = 5; x - y = 1  ->  x = 2, y = 1
    expectSolution(
      solveLinearSystem(
        [
          [2, 1],
          [1, -1],
        ],
        [5, 1],
      ),
      [2, 1],
    );
  });

  it('решает систему 3×3', () => {
    expectSolution(
      solveLinearSystem(
        [
          [2, 1, -1],
          [-3, -1, 2],
          [-2, 1, 2],
        ],
        [8, -11, -3],
      ),
      [2, 3, -1],
    );
  });

  it('единичная матрица возвращает правую часть как есть', () => {
    expectSolution(
      solveLinearSystem(
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [4, -2, 7],
      ),
      [4, -2, 7],
    );
  });

  it('справляется с нулём на главной диагонали', () => {
    // Без выбора главного элемента здесь было бы деление на ноль.
    expectSolution(
      solveLinearSystem(
        [
          [0, 1],
          [1, 0],
        ],
        [3, 5],
      ),
      [5, 3],
    );
  });

  it('возвращает null на вырожденной матрице', () => {
    expect(
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });

  it('не портит исходную матрицу', () => {
    const matrix = [
      [2, 1],
      [1, -1],
    ];
    const copy = matrix.map((row) => [...row]);
    solveLinearSystem(matrix, [5, 1]);
    expect(matrix).toEqual(copy);
  });

  it('отвергает неквадратную матрицу', () => {
    expect(() => solveLinearSystem([[1, 2, 3]], [1])).toThrow(/квадратной/);
  });

  it('решает систему 6×6, как в обратной кинематике', () => {
    const size = 6;
    const matrix = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => (row === column ? 4 : 1 / (row + column + 1))),
    );
    const expected = [1, -2, 3, -4, 5, -6];
    const rhs = matrix.map((row) => row.reduce((sum, value, i) => sum + value * expected[i]!, 0));

    expectSolution(solveLinearSystem(matrix, rhs), expected);
  });
});
