/**
 * Решение плотной системы линейных уравнений методом Гаусса с выбором главного
 * элемента по столбцу.
 *
 * Нужен обратной кинематике: на каждой итерации там решается система 6×6.
 * Вынесен отдельно, потому что ошибки в исключении Гаусса тихие — решение
 * получается неверным, а не падает, — и ловить их лучше своими тестами.
 */

/** Возвращает `null`, если матрица вырождена: для IK это сигнал увеличить демпфирование. */
export function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] | null {
  const size = rhs.length;
  if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
    throw new RangeError(`Матрица должна быть квадратной ${size}×${size}`);
  }

  // Работаем с копией: вызывающий код передаёт матрицу, которую ещё использует.
  const a = matrix.map((row, index) => [...row, rhs[index] ?? 0]);

  for (let column = 0; column < size; column += 1) {
    const pivotRow = findPivot(a, column, size);
    if (pivotRow === null) return null;

    if (pivotRow !== column) {
      const tmp = a[column]!;
      a[column] = a[pivotRow]!;
      a[pivotRow] = tmp;
    }

    const pivot = a[column]![column]!;
    for (let row = column + 1; row < size; row += 1) {
      const factor = a[row]![column]! / pivot;
      if (factor === 0) continue;
      for (let k = column; k <= size; k += 1) {
        a[row]![k] = a[row]![k]! - factor * a[column]![k]!;
      }
    }
  }

  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = a[row]![size]!;
    for (let column = row + 1; column < size; column += 1) {
      sum -= a[row]![column]! * solution[column]!;
    }
    const pivot = a[row]![row]!;
    if (pivot === 0) return null;
    solution[row] = sum / pivot;
  }

  return solution.every((value) => Number.isFinite(value)) ? solution : null;
}

function findPivot(
  a: readonly (readonly number[])[],
  column: number,
  size: number,
): number | null {
  let best = column;
  let bestValue = Math.abs(a[column]![column]!);

  for (let row = column + 1; row < size; row += 1) {
    const value = Math.abs(a[row]![column]!);
    if (value > bestValue) {
      best = row;
      bestValue = value;
    }
  }

  return bestValue < 1e-12 ? null : best;
}
