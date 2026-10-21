/** Exact, replayable Gauss–Jordan elimination. All public values are serializable strings. */
export type MatrixMode = "solve" | "rref" | "determinant" | "inverse";
export type Matrix = string[][];
export type StepType = "pivot" | "swap" | "scale" | "eliminate" | "complete";

export interface MatrixStep {
  index: number;
  type: StepType;
  target: number | null;
  source: number | null;
  pivotColumn: number | null;
  factor: string | null;
  title: string;
  explanation: string;
  formula: string;
  updates: { row: number; values: string[] }[];
}

export interface MatrixSolution {
  kind: "unique" | "infinite" | "inconsistent";
  particular: string[] | null;
  /** Each vector is paired with the corresponding freeColumns entry. */
  nullspace: string[][];
  freeColumns: number[];
}

export interface MatrixResult {
  mode: MatrixMode;
  initial: Matrix;
  final: Matrix;
  steps: MatrixStep[];
  /** Rank of A, excluding the right-hand side / appended identity. */
  rank: number;
  augmentedRank: number;
  pivotColumns: number[];
  determinant: string | null;
  inverse: Matrix | null;
  solution: MatrixSolution | null;
  rows: number;
  /** Width of the displayed matrix, including any appended identity. */
  columns: number;
  inputColumns: number;
  augmentedColumn: number | null;
}

export const SOLVER_LIMITS = Object.freeze({
  inputCells: 16_384,
  traceCells: 2_000_000,
  traceCharacters: 16_000_000,
  outputCells: 2_000_000,
  arithmeticOperations: 4_000_000,
  digits: 2048,
  textCharacters: 1_000_000,
});

const abs = (n: bigint) => (n < 0n ? -n : n);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

class Rational {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d = 1n) {
    if (d === 0n) throw new Error("A fraction cannot have a zero denominator.");
    if (n === 0n) {
      this.n = 0n;
      this.d = 1n;
      return;
    }
    const sign = d < 0n ? -1n : 1n;
    const divisor = gcd(n, d);
    this.n = (n / divisor) * sign;
    this.d = (d / divisor) * sign;
    if (
      abs(this.n).toString().length > SOLVER_LIMITS.digits ||
      this.d.toString().length > SOLVER_LIMITS.digits
    ) {
      throw new Error(
        `Exact fractions exceeded the ${SOLVER_LIMITS.digits}-digit computation budget. Try a smaller or simpler matrix.`,
      );
    }
  }
  add(other: Rational): Rational {
    const divisor = gcd(this.d, other.d);
    return new Rational(
      this.n * (other.d / divisor) + other.n * (this.d / divisor),
      (this.d / divisor) * other.d,
    );
  }
  mul(other: Rational): Rational {
    const a = gcd(this.n, other.d);
    const b = gcd(other.n, this.d);
    return new Rational(
      (this.n / a) * (other.n / b),
      (this.d / b) * (other.d / a),
    );
  }
  div(other: Rational): Rational {
    return this.mul(new Rational(other.d, other.n));
  }
  neg(): Rational {
    return new Rational(-this.n, this.d);
  }
  get zero(): boolean {
    return this.n === 0n;
  }
  get one(): boolean {
    return this.n === this.d;
  }
  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }
}

const ZERO = new Rational(0n);
const ONE = new Rational(1n);

function parseDecimal(source: string): Rational {
  const match =
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(source);
  if (!match)
    throw new Error(
      `“${source.slice(0, 40)}” is not a number. Use an integer, decimal, or fraction such as 2/3.`,
    );
  const fraction = match[3] ?? match[4] ?? "";
  const integer = match[2] ?? "0";
  const exponent = Number(match[5] ?? 0);
  if (
    !Number.isSafeInteger(exponent) ||
    Math.abs(exponent) > SOLVER_LIMITS.digits ||
    integer.length + fraction.length > SOLVER_LIMITS.digits
  ) {
    throw new Error(
      `Numbers must fit within ${SOLVER_LIMITS.digits} decimal digits.`,
    );
  }
  const shift = exponent - fraction.length;
  const numerator = BigInt(integer + fraction) * (match[1] === "-" ? -1n : 1n);
  return shift >= 0
    ? new Rational(numerator * 10n ** BigInt(shift))
    : new Rational(numerator, 10n ** BigInt(-shift));
}

function parseScalar(value: unknown): Rational {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Every matrix entry must be a number or a numeric string.");
  const source = String(value).trim().replaceAll("−", "-");
  if (!source)
    throw new Error(
      "Every matrix cell needs a value. Enter 0 for an empty coefficient.",
    );
  if (source.length > SOLVER_LIMITS.digits * 2 + 8)
    throw new Error(
      "This number is too long for the exact computation budget.",
    );
  const parts = source.split("/");
  if (parts.length === 1) return parseDecimal(source);
  if (parts.length === 2)
    return parseDecimal(parts[0].trim()).div(parseDecimal(parts[1].trim()));
  throw new Error(`“${source.slice(0, 40)}” is not a valid fraction.`);
}

function validateShape(input: unknown): asserts input is Matrix {
  if (
    !Array.isArray(input) ||
    !input.length ||
    !Array.isArray(input[0]) ||
    !input[0].length
  ) {
    throw new Error("Enter a matrix with at least one row and one column.");
  }
  const columns = input[0].length;
  if (input.length * columns > SOLVER_LIMITS.inputCells) {
    throw new Error(
      `This browser supports up to ${SOLVER_LIMITS.inputCells.toLocaleString("en-US")} input cells per solve. Reduce the matrix dimensions.`,
    );
  }
  if (input.some((row) => !Array.isArray(row) || row.length !== columns)) {
    throw new Error("Every row must have the same number of entries.");
  }
}

/** Accept JSON arrays or rows separated by newlines/semicolons; entries by CSV, tabs, or spaces. */
export function parseMatrixText(text: string): Matrix {
  if (text.length > SOLVER_LIMITS.textCharacters)
    throw new Error("The pasted matrix exceeds the 1 MB text budget.");
  const source = text.trim();
  if (!source) throw new Error("Paste matrix values first.");
  let values: unknown;
  if (source.startsWith("[")) {
    // Keep JSON numeric tokens as text, including integers beyond Number.MAX_SAFE_INTEGER.
    // Quoted strings are matched first so their contents are never transformed.
    const exactJSON = source.replace(
      /"(?:\\.|[^"\\])*"|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (token, number: string | undefined) =>
        number === undefined ? token : JSON.stringify(number),
    );
    try {
      values = JSON.parse(exactJSON);
    } catch {
      throw new Error(
        "Invalid JSON. Use an array of rows, for example [[1,2],[3,4]].",
      );
    }
  } else {
    values = source.split(/[\n;]+/).map((row) => {
      const trimmed = row.trim().replace(/\s*\|\s*/g, " ");
      if (trimmed.includes(","))
        return trimmed.split(",").map((cell) => cell.trim());
      return trimmed.split(/\s+/);
    });
  }
  validateShape(values);
  return values.map((row, r) =>
    row.map((value, c) => {
      try {
        parseScalar(value);
        return String(value).trim().replaceAll("−", "-");
      } catch (error) {
        throw new Error(
          `Row ${r + 1}, column ${c + 1}: ${(error as Error).message}`,
        );
      }
    }),
  );
}

/** Display conversion only; all calculation and exports retain exact fractions. */
export function formatScalar(value: string, decimal = false): string {
  if (!decimal || !value.includes("/")) return value.replace(/^-/, "−");
  const [n, d] = value.split("/");
  const quotient = Number(n) / Number(d);
  if (!Number.isFinite(quotient) || (quotient === 0 && BigInt(n) !== 0n))
    return value.replace(/^-/, "−");
  return Number(quotient.toPrecision(7)).toString().replace(/^-/, "−");
}

export const formatNumber = formatScalar;

/** Reconstruct any frame from compact row deltas. -1 is the original matrix. */
export function matrixAtStep(result: MatrixResult, index: number): Matrix {
  const matrix = result.initial.map((row) => [...row]);
  for (let step = 0; step <= Math.min(index, result.steps.length - 1); step++) {
    for (const update of result.steps[step].updates)
      matrix[update.row] = [...update.values];
  }
  return matrix;
}

export function solveMatrix(
  input: Matrix,
  mode: MatrixMode = "solve",
): MatrixResult {
  validateShape(input);
  if (!["solve", "rref", "determinant", "inverse"].includes(mode))
    throw new Error("Choose a supported matrix operation.");
  const rows = input.length;
  const inputColumns = input[0].length;
  if (
    input.reduce(
      (sum, row) =>
        sum + row.reduce((size, value) => size + String(value).length, 0),
      0,
    ) > SOLVER_LIMITS.textCharacters
  ) {
    throw new Error("The matrix values exceed the 1 MB input text budget.");
  }
  if (mode === "solve" && inputColumns < 2)
    throw new Error(
      "A system needs at least one variable column and a right-hand-side column.",
    );
  if ((mode === "inverse" || mode === "determinant") && rows !== inputColumns)
    throw new Error("Determinants and inverses require a square matrix.");
  const coefficientColumns = mode === "solve" ? inputColumns - 1 : inputColumns;
  let matrix = input.map((row, r) =>
    row.map((value, c) => {
      try {
        return parseScalar(value);
      } catch (error) {
        throw new Error(
          `Row ${r + 1}, column ${c + 1}: ${(error as Error).message}`,
        );
      }
    }),
  );
  if (mode === "inverse")
    matrix = matrix.map((row, r) => [
      ...row,
      ...Array.from({ length: rows }, (_, c) => (r === c ? ONE : ZERO)),
    ]);
  const columns = matrix[0].length;
  const initial = matrix.map((row) => row.map(String));
  const steps: MatrixStep[] = [];
  const pivotColumns: number[] = [];
  let traceCells = 0;
  let traceCharacters = 0;
  let operations = 0;
  let determinant = ONE;
  const trackDeterminant = rows === coefficientColumns;
  let pivotRow = 0;

  function charge(count: number) {
    operations += count;
    if (operations > SOLVER_LIMITS.arithmeticOperations)
      throw new Error(
        "This matrix exceeded the exact arithmetic budget. Try a smaller matrix or simpler values.",
      );
  }
  function emit(
    step: Omit<MatrixStep, "index" | "updates">,
    changedRows: number[] = [],
  ) {
    traceCells += changedRows.length * columns;
    if (traceCells > SOLVER_LIMITS.traceCells)
      throw new Error(
        "The full animation exceeded the browser trace budget. Try a smaller matrix; no steps have been omitted.",
      );
    const updates = changedRows.map((row) => ({
      row,
      values: matrix[row].map(String),
    }));
    traceCharacters +=
      step.title.length +
      step.explanation.length +
      step.formula.length +
      (step.factor?.length ?? 0) +
      updates.reduce(
        (sum, update) =>
          sum + update.values.reduce((size, value) => size + value.length, 0),
        0,
      );
    if (traceCharacters > SOLVER_LIMITS.traceCharacters)
      throw new Error(
        "The exact animation exceeded the 16 MB text budget. Try a smaller matrix or simpler values; no steps have been omitted.",
      );
    steps.push({ ...step, index: steps.length, updates });
  }
  const base = { source: null, target: null, pivotColumn: null, factor: null };

  for (let col = 0; col < coefficientColumns && pivotRow < rows; col++) {
    let selected = -1;
    // Exact arithmetic needs no floating-point tolerance. Prefer the smallest nonzero
    // numerator+denominator to limit intermediate fraction growth deterministically.
    let smallest: bigint | null = null;
    for (let r = pivotRow; r < rows; r++) {
      const candidate = matrix[r][col];
      if (!candidate.zero) {
        const cost = abs(candidate.n) + candidate.d;
        if (smallest === null || cost < smallest) {
          smallest = cost;
          selected = r;
        }
      }
    }
    if (selected === -1) continue;
    const pivotValue = matrix[selected][col];
    emit({
      ...base,
      type: "pivot",
      target: selected,
      pivotColumn: col,
      title: "Find the next pivot",
      explanation: `The nonzero entry ${pivotValue} in row ${selected + 1}, column ${col + 1} becomes the next pivot.`,
      formula: `a(${selected + 1}, ${col + 1}) = ${pivotValue}`,
    });
    if (selected !== pivotRow) {
      [matrix[pivotRow], matrix[selected]] = [
        matrix[selected],
        matrix[pivotRow],
      ];
      if (trackDeterminant) determinant = determinant.neg();
      emit(
        {
          ...base,
          type: "swap",
          target: pivotRow,
          source: selected,
          pivotColumn: col,
          title: "Bring the pivot into place",
          explanation: `Exchange rows ${pivotRow + 1} and ${selected + 1}. Row swaps preserve the solution set and reverse the determinant’s sign.`,
          formula: `R${pivotRow + 1} ↔ R${selected + 1}`,
        },
        [pivotRow, selected],
      );
    }
    const pivot = matrix[pivotRow][col];
    if (trackDeterminant) {
      charge(1);
      determinant = determinant.mul(pivot);
    }
    if (!pivot.one) {
      const factor = ONE.div(pivot);
      charge(columns);
      matrix[pivotRow] = matrix[pivotRow].map((value) => value.mul(factor));
      emit(
        {
          ...base,
          type: "scale",
          target: pivotRow,
          pivotColumn: col,
          factor: factor.toString(),
          title: "Normalize the pivot",
          explanation: `Multiply row ${pivotRow + 1} by ${factor} so the pivot becomes 1. Every entry in the row changes together.`,
          formula: `R${pivotRow + 1} ← (${factor}) R${pivotRow + 1}`,
        },
        [pivotRow],
      );
    }
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow || matrix[r][col].zero) continue;
      const factor = matrix[r][col].neg();
      charge(columns * 2);
      matrix[r] = matrix[r].map((value, c) =>
        value.add(matrix[pivotRow][c].mul(factor)),
      );
      emit(
        {
          ...base,
          type: "eliminate",
          target: r,
          source: pivotRow,
          pivotColumn: col,
          factor: factor.toString(),
          title:
            r > pivotRow ? "Clear below the pivot" : "Clear above the pivot",
          explanation: `Add ${factor} times row ${pivotRow + 1} to row ${r + 1}. The entry in column ${col + 1} becomes exactly zero.`,
          formula: `R${r + 1} ← R${r + 1} + (${factor}) R${pivotRow + 1}`,
        },
        [r],
      );
    }
    pivotColumns.push(col);
    pivotRow++;
  }

  const rank = pivotColumns.length;
  const pivotSet = new Set(pivotColumns);
  const freeColumns = Array.from(
    { length: coefficientColumns },
    (_, c) => c,
  ).filter((c) => !pivotSet.has(c));
  const final = matrix.map((row) => row.map(String));
  const determinantValue =
    rows === coefficientColumns
      ? rank === rows
        ? determinant.toString()
        : "0"
      : null;
  let solution: MatrixSolution | null = null;
  let augmentedRank = rank;
  if (mode === "solve") {
    const inconsistent = matrix.some(
      (row) =>
        row.slice(0, coefficientColumns).every((value) => value.zero) &&
        !row[coefficientColumns].zero,
    );
    if (inconsistent) {
      augmentedRank = rank + 1;
      solution = {
        kind: "inconsistent",
        particular: null,
        nullspace: [],
        freeColumns,
      };
    } else {
      if (
        coefficientColumns * (freeColumns.length + 1) >
        SOLVER_LIMITS.outputCells
      ) {
        throw new Error(
          "The full parametric solution exceeds the browser output budget (2,000,000 entries). Try fewer variables; no nullspace vectors have been omitted.",
        );
      }
      const particular = Array.from({ length: coefficientColumns }, () => "0");
      pivotColumns.forEach((c, r) => {
        particular[c] = matrix[r][coefficientColumns].toString();
      });
      const nullspace = freeColumns.map((free) => {
        const vector = Array.from({ length: coefficientColumns }, () => "0");
        vector[free] = "1";
        pivotColumns.forEach((c, r) => {
          vector[c] = matrix[r][free].neg().toString();
        });
        return vector;
      });
      solution = {
        kind: rank === coefficientColumns ? "unique" : "infinite",
        particular,
        nullspace,
        freeColumns,
      };
    }
  }
  const inverse =
    mode === "inverse" && rank === rows
      ? final.map((row) => row.slice(rows))
      : null;
  let title = "Reduced row echelon form";
  let explanation = `The matrix has rank ${rank}. Every pivot is 1, with zeros above and below it.`;
  let formula = `rank(A) = ${rank}`;
  if (solution) {
    title =
      solution.kind === "unique"
        ? "One exact solution"
        : solution.kind === "infinite"
          ? "Infinitely many solutions"
          : "No solution";
    explanation =
      solution.kind === "unique"
        ? "Every variable has a pivot. Read the unique solution directly from the right-hand column."
        : solution.kind === "infinite"
          ? `${freeColumns.length} free variable${freeColumns.length === 1 ? "" : "s"} remain. The solution is a particular vector plus any linear combination of the nullspace vectors.`
          : "A row has zero coefficients and a nonzero right-hand side. This contradiction means the equations cannot all hold at once.";
    formula =
      solution.kind === "unique"
        ? `x = (${solution.particular!.join(", ")})`
        : solution.kind === "infinite"
          ? "x = x₀ + t₁v₁ + ⋯"
          : "0 ≠ b";
  } else if (mode === "inverse") {
    title = inverse ? "The inverse is revealed" : "This matrix is singular";
    explanation = inverse
      ? "The left block is the identity. The transformed right block is the exact inverse of the original matrix."
      : "The left block cannot become the identity because the matrix has dependent rows. An inverse does not exist.";
    formula = inverse ? "[ I | A⁻¹ ]" : "det(A) = 0";
  } else if (mode === "determinant") {
    title = "The determinant is resolved";
    explanation = `Accounting for every pivot and row swap gives det(A) = ${determinantValue}. ${determinantValue === "0" ? "The matrix is singular." : "The matrix is invertible."}`;
    formula = `det(A) = ${determinantValue}`;
  }
  emit({ ...base, type: "complete", title, explanation, formula });
  return {
    mode,
    initial,
    final,
    steps,
    rank,
    augmentedRank,
    pivotColumns,
    determinant: determinantValue,
    inverse,
    solution,
    rows,
    columns,
    inputColumns,
    augmentedColumn:
      mode === "solve" ? coefficientColumns : mode === "inverse" ? rows : null,
  };
}
