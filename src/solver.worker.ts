import { solveMatrix, type Matrix, type MatrixMode } from "./math";

interface SolveRequest {
  id: number;
  input: Matrix;
  mode: MatrixMode;
}

self.onmessage = (event: MessageEvent<SolveRequest>) => {
  const { id, input, mode } = event.data;
  try {
    self.postMessage({ id, result: solveMatrix(input, mode) });
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "The matrix could not be solved.",
    });
  }
};
