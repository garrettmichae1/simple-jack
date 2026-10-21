import { describe, expect, it } from "vitest";
import {
  formatScalar,
  matrixAtStep,
  parseMatrixText,
  solveMatrix,
} from "./math";

const matrix = (rows: (number | string)[][]): string[][] =>
  rows.map((row) => row.map(String));

// Independent exact arithmetic for algebraic assertions (not the implementation's parser).
type Q = [bigint, bigint];
const q = (value: string): Q => {
  const [n, d = "1"] = value.split("/");
  return [BigInt(n), BigInt(d)];
};
const add = ([a, b]: Q, [c, d]: Q): Q => [a * d + c * b, b * d];
const mul = ([a, b]: Q, [c, d]: Q): Q => [a * c, b * d];
const equal = ([a, b]: Q, [c, d]: Q): boolean => a * d === c * b;
const dot = (row: string[], vector: string[]): Q =>
  row.reduce<Q>(
    (sum, value, j) => add(sum, mul(q(value), q(vector[j]))),
    [0n, 1n],
  );

describe("exact linear systems", () => {
  it("solves a familiar system with a negative coefficient", () => {
    const result = solveMatrix(
      matrix([
        [2, 1, -1, 8],
        [-3, -1, 2, -11],
        [-2, 1, 2, -3],
      ]),
      "solve",
    );
    expect(result.solution?.kind).toBe("unique");
    expect(result.solution?.particular).toEqual(["2", "3", "-1"]);
    expect(result.rank).toBe(3);
    expect(result.final).toEqual(
      matrix([
        [1, 0, 0, 2],
        [0, 1, 0, 3],
        [0, 0, 1, -1],
      ]),
    );
  });

  it("preserves rational, decimal, and scientific input exactly", () => {
    const result = solveMatrix(
      [
        ["0.1", "0", "0.3"],
        ["0", "2e-1", "1/3"],
      ],
      "solve",
    );
    expect(result.solution?.particular).toEqual(["3", "5/3"]);
  });

  it("finds a unique solution in a consistent overdetermined system", () => {
    const result = solveMatrix(
      matrix([
        [1, 1, 3],
        [1, -1, 1],
        [2, 0, 4],
        [0, 2, 2],
      ]),
      "solve",
    );
    expect(result.rank).toBe(2);
    expect(result.solution?.kind).toBe("unique");
    expect(result.solution?.particular).toEqual(["2", "1"]);
  });

  it("identifies a contradiction after elimination", () => {
    const result = solveMatrix(
      matrix([
        [1, 1, 2],
        [2, 2, 5],
      ]),
      "solve",
    );
    expect(result.solution?.kind).toBe("inconsistent");
    expect(result.solution?.particular).toBeNull();
    expect(result.rank).toBe(1);
  });

  it("returns a valid particular solution and full nullspace for an underdetermined system", () => {
    const input = matrix([
      [1, 2, -1, 3, 4],
      [2, 4, -2, 6, 8],
    ]);
    const result = solveMatrix(input, "solve");
    const solution = result.solution!;
    expect(solution.kind).toBe("infinite");
    expect(solution.freeColumns).toEqual([1, 2, 3]);
    expect(solution.nullspace).toHaveLength(3);
    for (const row of input) {
      expect(
        equal(dot(row.slice(0, -1), solution.particular!), q(row.at(-1)!)),
      ).toBe(true);
      for (const basis of solution.nullspace)
        expect(equal(dot(row.slice(0, -1), basis), [0n, 1n])).toBe(true);
    }
    solution.freeColumns.forEach((column, index) => {
      expect(solution.nullspace[index][column]).toBe("1");
      solution.freeColumns
        .filter((c) => c !== column)
        .forEach((c) => expect(solution.nullspace[index][c]).toBe("0"));
    });
  });

  it("handles the zero system without manufacturing pivots", () => {
    const result = solveMatrix(
      matrix([
        [0, 0, 0],
        [0, 0, 0],
      ]),
      "solve",
    );
    expect(result.rank).toBe(0);
    expect(result.solution?.kind).toBe("infinite");
    expect(result.solution?.particular).toEqual(["0", "0"]);
    expect(result.solution?.nullspace).toEqual(
      matrix([
        [1, 0],
        [0, 1],
      ]),
    );
  });

  it("handles a contradiction with no nonzero coefficient", () => {
    const result = solveMatrix(matrix([[0, 0, 7]]), "solve");
    expect(result.rank).toBe(0);
    expect(result.solution?.kind).toBe("inconsistent");
  });

  it("handles one equation and one variable", () => {
    expect(
      solveMatrix(matrix([[-6, 5]]), "solve").solution?.particular,
    ).toEqual(["-5/6"]);
  });

  it("solves deterministic generated invertible systems of increasing dimensions", () => {
    let state = 0x5a17;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    for (let n = 2; n <= 10; n++) {
      const expected = Array.from({ length: n }, () => (random() % 13) - 6);
      // Strict diagonal dominance proves nonsingularity independently of the solver.
      const coefficients = Array.from({ length: n }, (_, i) => {
        const row = Array.from({ length: n }, () => (random() % 9) - 4);
        row[i] = row.reduce(
          (sum, value, j) => sum + (j === i ? 0 : Math.abs(value)),
          1,
        );
        return row;
      });
      const input = coefficients.map((row) => [
        ...row,
        row.reduce((sum, value, j) => sum + value * expected[j], 0),
      ]);
      const result = solveMatrix(matrix(input), "solve");
      expect(result.solution?.kind).toBe("unique");
      expect(result.solution?.particular).toEqual(expected.map(String));
    }
  });
});

describe("matrix operations", () => {
  it("computes RREF for a rectangular matrix and is idempotent", () => {
    const result = solveMatrix(
      matrix([
        [1, 2, 0, 3],
        [2, 4, 1, 7],
        [0, 0, 2, 2],
      ]),
      "rref",
    );
    expect(result.final).toEqual(
      matrix([
        [1, 2, 0, 3],
        [0, 0, 1, 1],
        [0, 0, 0, 0],
      ]),
    );
    expect(result.rank).toBe(2);
    expect(result.pivotColumns).toEqual([0, 2]);
    expect(solveMatrix(result.final, "rref").final).toEqual(result.final);
  });

  it("tracks determinant parity across row swaps", () => {
    expect(
      solveMatrix(
        matrix([
          [0, 1],
          [1, 0],
        ]),
        "determinant",
      ).determinant,
    ).toBe("-1");
    expect(
      solveMatrix(
        matrix([
          [0, 1, 0],
          [0, 0, 1],
          [1, 0, 0],
        ]),
        "determinant",
      ).determinant,
    ).toBe("1");
  });

  it("computes exact determinants without confusing scaled pivots", () => {
    expect(
      solveMatrix(
        matrix([
          [2, 1, 3],
          [0, -3, 2],
          [0, 0, "1/2"],
        ]),
        "determinant",
      ).determinant,
    ).toBe("-3");
    expect(
      solveMatrix(
        matrix([
          [1, 2],
          [2, 4],
        ]),
        "determinant",
      ).determinant,
    ).toBe("0");
    expect(solveMatrix([["2/7"]], "determinant").determinant).toBe("2/7");
  });

  it("finds an inverse and verifies both matrix products exactly", () => {
    const input = matrix([
      [2, 1, 0],
      [1, 3, 1],
      [0, 1, 2],
    ]);
    const result = solveMatrix(input, "inverse");
    expect(result.inverse).not.toBeNull();
    const inverse = result.inverse!;
    for (const [left, right] of [
      [input, inverse],
      [inverse, input],
    ]) {
      left.forEach((row, i) => {
        right[0].forEach((_, j) => {
          const column = right.map((r) => r[j]);
          expect(equal(dot(row, column), [i === j ? 1n : 0n, 1n])).toBe(true);
        });
      });
    }
  });

  it("reports a singular inverse without returning a false identity", () => {
    const result = solveMatrix(
      matrix([
        [1, 2],
        [2, 4],
      ]),
      "inverse",
    );
    expect(result.inverse).toBeNull();
    expect(result.rank).toBe(1);
    expect(result.determinant).toBe("0");
  });

  it("supports dimensions beyond the visual presets", () => {
    const input = Array.from({ length: 17 }, (_, i) =>
      Array.from({ length: 19 }, (_, j) => String(i === j ? 1 : 0)),
    );
    const result = solveMatrix(input, "rref");
    expect(result.final).toEqual(input);
    expect(result.rank).toBe(17);
  });

  it("retains every operation as a replayable compact row patch", () => {
    const input = matrix([
      [0, 2, 3, 4],
      [2, 1, -1, 2],
      [1, -1, 1, 3],
    ]);
    const result = solveMatrix(input, "solve");
    const replay = result.initial.map((row) => [...row]);
    expect(matrixAtStep(result, -1)).toEqual(result.initial);
    result.steps.forEach((step, index) => {
      expect(step.index).toBe(index);
      expect(step.updates.length).toBeLessThanOrEqual(2);
      step.updates.forEach((update) => {
        replay[update.row] = [...update.values];
      });
      expect(matrixAtStep(result, index)).toEqual(replay);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.explanation.length).toBeGreaterThan(0);
    });
    expect(replay).toEqual(result.final);
    expect(result.steps.at(-1)?.type).toBe("complete");
    expect(input).toEqual(
      matrix([
        [0, 2, 3, 4],
        [2, 1, -1, 2],
        [1, -1, 1, 3],
      ]),
    );
  });
});

describe("input parsing and validation", () => {
  it.each<[string, string[][]]>([
    [
      "1, 2, 3\n4, 5, 6",
      [
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
    ],
    [
      "1\t2\t3\n4\t5\t6",
      [
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
    ],
    [
      "1 2 3; 4 5 6",
      [
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
    ],
    [
      '[[1, "2/3"], [4, "0.5"]]',
      [
        ["1", "2/3"],
        ["4", "0.5"],
      ],
    ],
  ])("parses %s", (text, expected) => {
    expect(parseMatrixText(text)).toEqual(expected);
  });

  it.each(["", "  \n  ", "1 2\n3", "[[1,2],[3]]"])(
    "rejects empty or ragged imports: %s",
    (text) => {
      expect(() => parseMatrixText(text)).toThrow();
    },
  );

  it.each(["Infinity", "NaN", "1/0", "hello", "1e999999", "", "1/2/3"])(
    "rejects invalid scalar %s",
    (value) => {
      expect(() => solveMatrix([[value]], "rref")).toThrow();
    },
  );

  it("rejects invalid dimensions and square-only mode misuse", () => {
    expect(() => solveMatrix([], "rref")).toThrow();
    expect(() => solveMatrix([[]], "rref")).toThrow();
    expect(() => solveMatrix([["1"], ["1", "2"]], "rref")).toThrow();
    expect(() => solveMatrix([["1", "2", "3"]], "determinant")).toThrow();
    expect(() => solveMatrix([["1", "2", "3"]], "inverse")).toThrow();
    expect(() => solveMatrix([["1"]], "solve")).toThrow();
  });

  it("rejects an oversized input before attempting elimination", () => {
    const input = Array.from({ length: 129 }, () =>
      Array.from({ length: 129 }, () => "0"),
    );
    expect(() => solveMatrix(input, "rref")).toThrow();
  });

  it("preserves the complete numeric lexeme in JSON imports", () => {
    expect(parseMatrixText("[[9007199254740993,0.10000000000000001]]")).toEqual(
      [["9007199254740993", "0.10000000000000001"]],
    );
    expect(
      solveMatrix(parseMatrixText("[[1,9007199254740993]]"), "solve").solution
        ?.particular,
    ).toEqual(["9007199254740993"]);
    expect(() => parseMatrixText("[[01]]")).toThrow();
  });

  it("rejects missing CSV entries instead of silently changing dimensions", () => {
    expect(() => parseMatrixText("1,,2\n3,4,5")).toThrow();
  });

  it("guards the full nullspace output before allocating it", () => {
    expect(() => solveMatrix([Array(16384).fill("0")], "solve")).toThrow(
      /output budget/,
    );
  });

  it("does not calculate an unused determinant for rectangular matrices", () => {
    expect(
      solveMatrix(
        [
          ["1e1500", "0", "0"],
          ["0", "1e1500", "0"],
        ],
        "rref",
      ).final,
    ).toEqual([
      ["1", "0", "0"],
      ["0", "1", "0"],
    ]);
  });

  it("normalizes signs and reduces fractions in output", () => {
    const result = solveMatrix([["-2/-4", "6/-8"]], "solve");
    expect(result.initial).toEqual([["1/2", "-3/4"]]);
    expect(result.solution?.particular).toEqual(["-3/2"]);
  });

  it("offers a readable approximate display while retaining exact strings", () => {
    expect(formatScalar("1/3")).toBe("1/3");
    expect(Number(formatScalar("1/2", true))).toBe(0.5);
  });
});
