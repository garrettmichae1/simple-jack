import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Code2,
  Expand,
  Github,
  Grip,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import MathScene from "./components/MathScene";
import RowFlow from "./components/RowFlow";
import {
  formatScalar,
  matrixAtStep,
  parseMatrixText,
  solveMatrix,
} from "./math";
import type { MatrixMode, MatrixResult } from "./math";

const DEFAULT = [
  ["2", "1", "-1", "8"],
  ["-3", "-1", "2", "-11"],
  ["-2", "1", "2", "-3"],
];
const PRESETS = [
  {
    name: "A classic in three dimensions",
    label: "The classic",
    detail: "3 equations · one elegant answer",
    mode: "solve" as MatrixMode,
    matrix: DEFAULT,
  },
  {
    name: "Many paths, one plane",
    label: "Infinite possibilities",
    detail: "A system with infinitely many solutions",
    mode: "solve" as MatrixMode,
    matrix: [
      ["1", "2", "-1", "3"],
      ["2", "4", "-2", "6"],
      ["-1", "-2", "1", "-3"],
    ],
  },
  {
    name: "When the lines never meet",
    label: "A beautiful contradiction",
    detail: "See why a system has no solution",
    mode: "solve" as MatrixMode,
    matrix: [
      ["1", "1", "2"],
      ["2", "2", "5"],
    ],
  },
  {
    name: "The other side of a transformation",
    label: "Find the inverse",
    detail: "Watch A become the identity",
    mode: "inverse" as MatrixMode,
    matrix: [
      ["2", "1", "0"],
      ["1", "2", "1"],
      ["0", "1", "2"],
    ],
  },
  {
    name: "The measure of a transformation",
    label: "Signed volume",
    detail: "A 4 × 4 determinant",
    mode: "determinant" as MatrixMode,
    matrix: [
      ["2", "1", "0", "0"],
      ["1", "3", "1", "0"],
      ["0", "1", "3", "1"],
      ["0", "0", "1", "2"],
    ],
  },
];
const MODES: {
  id: MatrixMode;
  name: string;
  short: string;
  notation: string;
  description: string;
}[] = [
  {
    id: "solve",
    name: "Solve a system",
    short: "Solve",
    notation: "Ax = b",
    description: "The last column is the right-hand side, b.",
  },
  {
    id: "rref",
    name: "Row reduction",
    short: "RREF",
    notation: "A → R",
    description: "Reduce any rectangular matrix to canonical form.",
  },
  {
    id: "inverse",
    name: "Matrix inverse",
    short: "Inverse",
    notation: "A⁻¹",
    description: "Enter a square matrix to find its inverse.",
  },
  {
    id: "determinant",
    name: "Determinant",
    short: "Determinant",
    notation: "det(A)",
    description: "Enter a square matrix to measure signed volume.",
  },
];
const sub = (n: number) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[+d]);
const clone = (a: string[][]) => a.map((r) => [...r]);
const initialResult = solveMatrix(DEFAULT, "solve");

function Scalar({
  value,
  decimal = false,
}: {
  value: string;
  decimal?: boolean;
}) {
  const shown = formatScalar(value, decimal);
  const parts = !decimal ? shown.split("/") : [];
  return parts.length === 2 ? (
    <span className="fraction">
      <span>{parts[0]}</span>
      <span>{parts[1]}</span>
    </span>
  ) : (
    <span>{shown.replace(/^-/, "−")}</span>
  );
}

export default function App() {
  const [input, setInput] = useState<string[][]>(() => clone(DEFAULT));
  const [mode, setMode] = useState<MatrixMode>("solve");
  const [dimensions, setDimensions] = useState({ rows: "3", cols: "3" });
  const [result, setResult] = useState<MatrixResult>(initialResult);
  const [stepIndex, setStepIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [decimal, setDecimal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"import" | "method" | null>(null);
  const [paste, setPaste] = useState("");
  const [importError, setImportError] = useState("");
  const [presetOpen, setPresetOpen] = useState(false);
  const [sceneLabel, setSceneLabel] = useState(PRESETS[0].name);
  const [view, setView] = useState({ row: 0, col: 0 });
  const [toast, setToast] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const reducedMotion = !!useReducedMotion();
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const current = useMemo(
    () => matrixAtStep(result, stepIndex),
    [result, stepIndex],
  );
  const step = stepIndex >= 0 ? result.steps[stepIndex] : null;
  const completed = stepIndex === result.steps.length - 1;
  const progress = (stepIndex + 1) / result.steps.length;
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const resultMode = MODES.find((m) => m.id === result.mode)!;
  const isLarge = input.length * input[0].length > 100;

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setBusy(false);
    requestId.current++;
  }, []);
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!playing) return;
    if (completed) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(
      () => setStepIndex((i) => Math.min(i + 1, result.steps.length - 1)),
      (reducedMotion ? 1000 : 1900) / speed,
    );
    return () => clearTimeout(id);
  }, [
    playing,
    stepIndex,
    completed,
    speed,
    result.steps.length,
    reducedMotion,
  ]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName) ||
          e.target.isContentEditable)
      )
        return;
      if (modal) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (completed) setStepIndex(-1);
        setPlaying((v) => !v);
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        setStepIndex((i) => Math.min(i + 1, result.steps.length - 1));
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setStepIndex((i) => Math.max(i - 1, -1));
      }
      if (e.code === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, completed, result.steps.length]);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal]);
  useEffect(() => {
    const list = historyRef.current;
    const item = list?.querySelector<HTMLElement>('[data-current="true"]');
    if (list && item) {
      const y = item.offsetTop;
      if (
        y < list.scrollTop ||
        y + item.offsetHeight > list.scrollTop + list.clientHeight
      )
        list.scrollTo({
          top: Math.max(0, y - 55),
          behavior: reducedMotion ? "instant" : "smooth",
        });
    }
  }, [stepIndex, reducedMotion]);

  const run = useCallback(
    (
      matrix = input,
      selectedMode = mode,
      label = "Your own mathematical composition",
    ) => {
      cancel();
      setError("");
      setPlaying(false);
      setBusy(true);
      const id = ++requestId.current;
      try {
        const w = new Worker(new URL("./solver.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.current = w;
        w.onmessage = (
          event: MessageEvent<{
            id: number;
            result?: MatrixResult;
            error?: string;
          }>,
        ) => {
          if (event.data.id !== requestId.current) return;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          w.terminate();
          worker.current = null;
          setBusy(false);
          if (event.data.error) {
            setError(event.data.error);
            return;
          }
          if (event.data.result) {
            setResult(event.data.result);
            setStepIndex(-1);
            setPlaying(true);
            setDirty(false);
            setView({ row: 0, col: 0 });
            setSceneLabel(label);
          }
        };
        w.onerror = () => {
          cancel();
          setError(
            "The calculation could not finish. Try a smaller matrix or simpler fractions.",
          );
        };
        timeoutRef.current = setTimeout(() => {
          cancel();
          setError(
            "This exact calculation exceeded 30 seconds. Try a smaller matrix or simpler fractions.",
          );
        }, 30000);
        w.postMessage({ id, input: matrix, mode: selectedMode });
      } catch {
        cancel();
        setError(
          "The solver could not start. Please reload this page in a current browser.",
        );
      }
    },
    [input, mode, cancel],
  );

  function editMatrix(matrix: string[][], selectedMode = mode) {
    cancel();
    setInput(clone(matrix));
    setMode(selectedMode);
    setDimensions({
      rows: String(matrix.length),
      cols: String(matrix[0].length - (selectedMode === "solve" ? 1 : 0)),
    });
    setDirty(true);
    setPlaying(false);
    setError("");
  }
  function resize() {
    const rows = Number(dimensions.rows),
      cols = Number(dimensions.cols),
      total = cols + (mode === "solve" ? 1 : 0);
    if (
      !Number.isSafeInteger(rows) ||
      !Number.isSafeInteger(cols) ||
      rows < 1 ||
      cols < 1
    ) {
      setError("Use positive whole numbers for both dimensions.");
      return;
    }
    if (rows * total > 16384) {
      setError(
        "This browser edition supports up to 16,384 input cells per matrix.",
      );
      return;
    }
    if ((mode === "inverse" || mode === "determinant") && rows !== cols) {
      setError(
        "This operation needs a square matrix. Set rows and columns to the same value.",
      );
      return;
    }
    editMatrix(
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: total }, (_, c) => input[r]?.[c] ?? "0"),
      ),
    );
  }
  function changeMode(next: MatrixMode) {
    if (next === mode) return;
    const coefficients =
      mode === "solve" ? input.map((r) => r.slice(0, -1)) : input;
    const matrix =
      next === "solve"
        ? coefficients.map((r) => [...r, "0"])
        : clone(coefficients);
    editMatrix(matrix, next);
  }
  function randomize() {
    const n = input.length,
      cols = input[0].length;
    editMatrix(
      Array.from({ length: n }, (_, r) =>
        Array.from({ length: cols }, (_, c) =>
          String(Math.floor(Math.random() * 9) - 4 + (r === c ? 5 : 0)),
        ),
      ),
    );
  }
  function choosePreset(index: number) {
    const p = PRESETS[index];
    editMatrix(p.matrix, p.mode);
    setPresetOpen(false);
    run(p.matrix, p.mode, p.name);
  }
  function applyImport() {
    try {
      const parsed = parseMatrixText(paste);
      if (mode === "solve" && parsed[0].length < 2)
        throw new Error(
          "A system needs at least one coefficient and a right-hand side.",
        );
      editMatrix(parsed);
      setModal(null);
      setImportError("");
      setToast("Matrix imported. Ready when you are.");
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "Check the matrix format.",
      );
    }
  }
  function exportResult() {
    const data = {
      application: "Simple Jack",
      arithmetic: "exact rational",
      ...result,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "simple-jack-solution.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Solution and every step exported.");
  }
  const activeRows = [step?.target, step?.source];
  const visibleRows = current.slice(view.row, view.row + 7);
  const visibleCols = Math.min(current[0].length - view.col, 9);
  const hasViewport = current.length > 7 || current[0].length > 9;
  const traceStart = Math.max(0, stepIndex - 35);
  const traceEnd = Math.min(result.steps.length, Math.max(stepIndex + 36, 70));

  return (
    <div className={`app ${focusMode ? "focus-mode" : ""}`}>
      <header className="site-header">
        <a className="brand" href="#" aria-label="Simple Jack home">
          <span className="brand-mark">
            <i />
            <span>×</span>
            <i />
          </span>
          <span>
            simple jack<span className="brand-period">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#studio" className="nav-active">
            The studio
          </a>
          <button onClick={() => setModal("method")}>
            The method <ArrowUpRight size={13} />
          </button>
        </nav>
        <a
          className="github-link"
          href="https://github.com/garrettmichae1/simple-jack"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          <span>View source</span>
          <ArrowUpRight size={13} />
        </a>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="small-cross">✳</span> AN EXPLORATION OF LINEAR
              ALGEBRA
            </div>
            <h1>
              The art of finding <em>x.</em>
            </h1>
          </div>
          <div className="intro-aside">
            <p>
              Every matrix holds a story.
              <br />
              Watch the mathematics unfold.
            </p>
            <span className="local-badge">
              <span /> EXACT ARITHMETIC. ENTIRELY IN YOUR BROWSER.
            </span>
          </div>
        </section>
        <section id="studio" className="studio" aria-label="Matrix studio">
          <aside className="input-panel">
            <div className="panel-heading">
              <span className="section-number">01</span>
              <h2>Set the conditions</h2>
              <span className="mini-icon">
                <Grip size={15} />
              </span>
            </div>
            <div className="input-body">
              <label className="field-label" htmlFor="operation">
                OPERATION <span>01—04</span>
              </label>
              <div className="operation-select">
                <span className="operation-symbol">{modeInfo.notation}</span>
                <select
                  id="operation"
                  value={mode}
                  onChange={(e) => changeMode(e.target.value as MatrixMode)}
                >
                  {MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
              <div className="dimension-heading">
                <label className="field-label">DIMENSIONS</label>
                <span>
                  {mode === "solve" ? "equations × unknowns" : "rows × columns"}
                </span>
              </div>
              <div className="dimension-controls">
                <input
                  aria-label="Number of rows"
                  type="number"
                  min="1"
                  step="1"
                  value={dimensions.rows}
                  onChange={(e) =>
                    setDimensions({ ...dimensions, rows: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && resize()}
                />
                <span>×</span>
                <input
                  aria-label="Number of columns"
                  type="number"
                  min="1"
                  step="1"
                  value={dimensions.cols}
                  onChange={(e) =>
                    setDimensions({ ...dimensions, cols: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && resize()}
                />
                <button
                  className="dimension-apply"
                  onClick={resize}
                  title="Apply matrix dimensions"
                >
                  <Check size={15} />
                  <span>Apply</span>
                </button>
              </div>
              <div className="matrix-input-label">
                <label className="field-label">YOUR MATRIX</label>
                <button
                  className="text-button"
                  onClick={() => {
                    setPaste("");
                    setImportError("");
                    setModal("import");
                  }}
                >
                  <Clipboard size={12} /> Paste
                </button>
              </div>
              {isLarge ? (
                <div className="large-input">
                  <Code2 size={24} />
                  <strong>
                    {input.length} × {input[0].length} matrix loaded
                  </strong>
                  <p>Use the text editor to edit large matrices.</p>
                  <button
                    onClick={() => {
                      setPaste(input.map((r) => r.join(" ")).join("\n"));
                      setImportError("");
                      setModal("import");
                    }}
                  >
                    Open matrix editor <ArrowUpRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="matrix-editor-wrap">
                  <div
                    className="matrix-editor"
                    style={{
                      gridTemplateColumns: `repeat(${input[0].length}, minmax(34px,1fr))`,
                    }}
                  >
                    {input[0].map((_, c) => (
                      <span
                        key={`head-${c}`}
                        className={`column-label ${mode === "solve" && c === input[0].length - 1 ? "rhs-label" : ""}`}
                      >
                        {mode === "solve" && c === input[0].length - 1
                          ? "b"
                          : mode === "solve"
                            ? `x${sub(c + 1)}`
                            : `c${sub(c + 1)}`}
                      </span>
                    ))}
                    {input.map((row, r) =>
                      row.map((value, c) => (
                        <input
                          key={`${r}-${c}`}
                          aria-label={`Row ${r + 1}, column ${c + 1}`}
                          className={
                            mode === "solve" && c === row.length - 1
                              ? "rhs-input"
                              : ""
                          }
                          value={value}
                          spellCheck={false}
                          onChange={(e) => {
                            const next = clone(input);
                            next[r][c] = e.target.value;
                            cancel();
                            setInput(next);
                            setDirty(true);
                            setPlaying(false);
                            setError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") run();
                          }}
                        />
                      )),
                    )}
                  </div>
                </div>
              )}
              <p className="input-hint">
                {modeInfo.description}
                <br />
                Integers, decimals, and fractions like <span>1/3</span>.
              </p>
              <div className="input-tools">
                <button className="text-button" onClick={randomize}>
                  <Shuffle size={13} /> Randomize
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    editMatrix(DEFAULT, "solve");
                    setSceneLabel(PRESETS[0].name);
                  }}
                >
                  <RotateCcw size={12} /> Reset
                </button>
              </div>
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="input-error"
                    role="alert"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                className="solve-button"
                onClick={() => (busy ? cancel() : run())}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                <span>{busy ? "Cancel calculation" : "Let it unfold"}</span>
                {!busy && <ArrowRight size={18} />}
              </button>
              <div className="button-caption">
                {dirty
                  ? "Your changes are ready to solve."
                  : "A little curiosity goes a long way."}
              </div>
            </div>
            <div className="preset-area">
              <span className="field-label">A PLACE TO BEGIN</span>
              <div className="preset-menu">
                <button
                  className="preset-trigger"
                  aria-expanded={presetOpen}
                  onClick={() => setPresetOpen((v) => !v)}
                >
                  <span>
                    <span className="preset-dot" />
                    Explore an example
                  </span>
                  <ChevronDown size={14} />
                </button>
                {presetOpen && (
                  <div className="preset-options">
                    {PRESETS.map((p, i) => (
                      <button key={p.label} onClick={() => choosePreset(i)}>
                        <strong>{p.label}</strong>
                        <span>{p.detail}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
          <div className="visual-panel">
            <div className="visual-topbar">
              <div className="canvas-label">
                <span className="live-dot" /> THE LIVING MATRIX{" "}
                <span className="topbar-divider" />{" "}
                <span className="visual-mode">{resultMode.notation}</span>
              </div>
              <div className="canvas-actions">
                <button
                  className={`format-toggle ${decimal ? "selected" : ""}`}
                  title="Toggle exact fractions and decimal display"
                  aria-pressed={decimal}
                  onClick={() => setDecimal((v) => !v)}
                >
                  {decimal ? "0.25" : "¼"}
                  <span>{decimal ? "Decimal" : "Exact"}</span>
                </button>
                <button
                  className="icon-button"
                  onClick={() => setFocusMode((v) => !v)}
                  title={focusMode ? "Exit focus view" : "Enter focus view"}
                  aria-label={
                    focusMode ? "Exit focus view" : "Enter focus view"
                  }
                >
                  {focusMode ? <X size={16} /> : <Expand size={15} />}
                </button>
              </div>
            </div>
            <div
              className={`art-stage ${current.length > 5 ? "large-stage" : ""}`}
            >
              <MathScene
                className="scene"
                progress={progress}
                playing={playing}
                pulseKey={stepIndex}
                reducedMotion={reducedMotion}
              />
              <div className="stage-coordinates">
                <span>FIG. 01 / THE TRANSFORMATION</span>
                <span>
                  {String(result.rows).padStart(2, "0")} ×{" "}
                  {String(result.columns).padStart(2, "0")}
                </span>
              </div>
              <div className="matrix-stage-shell">
                <div className="matrix-name">
                  {completed
                    ? "R"
                    : stepIndex < 0
                      ? "A"
                      : `A${sub(stepIndex + 1)}`}
                  <span>
                    {result.mode === "solve"
                      ? "augmented system"
                      : result.mode === "inverse"
                        ? "[ A | I ]"
                        : "matrix"}
                  </span>
                </div>
                <div
                  className={`live-matrix ${visibleCols > 6 ? "compact" : ""}`}
                  style={{
                    gridTemplateColumns: `repeat(${visibleCols},minmax(35px,1fr))`,
                  }}
                >
                  <RowFlow
                    source={
                      step?.source == null ? null : step.source - view.row
                    }
                    target={
                      step?.target == null ? null : step.target - view.row
                    }
                    rows={visibleRows.length}
                    pulseKey={stepIndex}
                    kind={step?.type ?? ""}
                    reducedMotion={reducedMotion}
                    factor={step?.factor ?? null}
                  />
                  {visibleRows.map((row, ri) =>
                    row.slice(view.col, view.col + 9).map((value, ci) => {
                      const r = ri + view.row,
                        c = ci + view.col;
                      const target = r === step?.target,
                        source = r === step?.source,
                        pivot = target && c === step?.pivotColumn;
                      return (
                        <motion.div
                          layout={!reducedMotion}
                          className={`matrix-cell ${target ? "target-cell" : ""} ${source ? "source-cell" : ""} ${pivot ? "pivot-cell" : ""} ${value === "0" ? "zero-cell" : ""} ${result.augmentedColumn === c ? "augmented-cell" : ""}`}
                          key={`${r}-${c}`}
                          title={`Row ${r + 1}, column ${c + 1}: ${value}`}
                        >
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                              className="cell-value"
                              key={value}
                              initial={{
                                opacity: 0,
                                y: reducedMotion ? 0 : 12,
                                filter: reducedMotion ? "none" : "blur(4px)",
                              }}
                              animate={{
                                opacity: 1,
                                y: 0,
                                filter: "blur(0px)",
                              }}
                              exit={{
                                opacity: 0,
                                y: reducedMotion ? 0 : -12,
                                filter: reducedMotion ? "none" : "blur(4px)",
                              }}
                              transition={{ duration: reducedMotion ? 0 : 0.5 }}
                            >
                              <Scalar value={value} decimal={decimal} />
                            </motion.span>
                          </AnimatePresence>
                          {pivot && (
                            <motion.span
                              className="pivot-ring"
                              layoutId="pivot"
                              transition={{ duration: 0.5 }}
                            />
                          )}
                        </motion.div>
                      );
                    }),
                  )}
                </div>
                {hasViewport && (
                  <div className="matrix-viewport">
                    <span>
                      Rows {view.row + 1}–
                      {Math.min(view.row + 7, current.length)} · cols{" "}
                      {view.col + 1}–{Math.min(view.col + 9, current[0].length)}
                    </span>
                    <button
                      aria-label="Previous rows"
                      disabled={!view.row}
                      onClick={() =>
                        setView((v) => ({ ...v, row: Math.max(0, v.row - 7) }))
                      }
                    >
                      ↑
                    </button>
                    <button
                      aria-label="Next rows"
                      disabled={view.row + 7 >= current.length}
                      onClick={() => setView((v) => ({ ...v, row: v.row + 7 }))}
                    >
                      ↓
                    </button>
                    <button
                      aria-label="Previous columns"
                      disabled={!view.col}
                      onClick={() =>
                        setView((v) => ({ ...v, col: Math.max(0, v.col - 9) }))
                      }
                    >
                      ←
                    </button>
                    <button
                      aria-label="Next columns"
                      disabled={view.col + 9 >= current[0].length}
                      onClick={() => setView((v) => ({ ...v, col: v.col + 9 }))}
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
              <div className="stage-footer">
                <span className="stage-legend">
                  <i />{" "}
                  {activeRows.some((r) => r !== null && r !== undefined) &&
                  !completed
                    ? "An elementary transformation"
                    : "Order, waiting to be discovered"}
                </span>
                <span className="stage-signature">
                  a study in transformation
                </span>
              </div>
            </div>
            <div
              className="operation-readout"
              aria-live={playing ? "off" : "polite"}
            >
              <div className={`operation-icon ${completed ? "finished" : ""}`}>
                {completed ? (
                  <Check size={18} />
                ) : stepIndex < 0 ? (
                  <Sparkles size={18} />
                ) : (
                  <span>{String(stepIndex + 1).padStart(2, "0")}</span>
                )}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${stepIndex}-${result.mode}`}
                  initial={{ opacity: 0, y: reducedMotion ? 0 : 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="operation-copy"
                >
                  <h3>{step?.title ?? "Possibility, in its original form."}</h3>
                  <p>
                    {step?.explanation ??
                      "Press play and follow every step toward clarity."}
                  </p>
                </motion.div>
              </AnimatePresence>
              <span className="operation-formula">
                {step?.formula ?? resultMode.notation}
              </span>
            </div>
            <div className="playback">
              <div className="timeline-wrap">
                <input
                  aria-label="Animation timeline"
                  type="range"
                  min={-1}
                  max={result.steps.length - 1}
                  value={stepIndex}
                  style={
                    {
                      "--progress": `${progress * 100}%`,
                    } as React.CSSProperties
                  }
                  onChange={(e) => {
                    setPlaying(false);
                    setStepIndex(Number(e.target.value));
                  }}
                />
              </div>
              <div className="playback-bottom">
                <div className="transport">
                  <button
                    className="icon-button"
                    onClick={() => {
                      setPlaying(false);
                      setStepIndex(-1);
                    }}
                    aria-label="Rewind to start"
                  >
                    <SkipBack size={15} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setPlaying(false);
                      setStepIndex((i) => Math.max(-1, i - 1));
                    }}
                    disabled={stepIndex === -1}
                    aria-label="Previous step"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="play-button"
                    onClick={() => {
                      if (completed) setStepIndex(-1);
                      setPlaying((v) => !v);
                    }}
                    aria-label={playing ? "Pause animation" : "Play animation"}
                  >
                    {playing ? (
                      <Pause size={16} fill="currentColor" />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setPlaying(false);
                      setStepIndex((i) =>
                        Math.min(result.steps.length - 1, i + 1),
                      );
                    }}
                    disabled={completed}
                    aria-label="Next step"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setPlaying(false);
                      setStepIndex(result.steps.length - 1);
                    }}
                    aria-label="Jump to result"
                  >
                    <SkipForward size={15} />
                  </button>
                </div>
                <span className="step-counter">
                  <strong>{String(stepIndex + 1).padStart(2, "0")}</strong> /{" "}
                  {String(result.steps.length).padStart(2, "0")}{" "}
                  <span>steps</span>
                </span>
                <label className="speed-control">
                  <span>Tempo</span>
                  <select
                    aria-label="Animation speed"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[0.5, 1, 1.5, 2, 4].map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>
        <section className="insights-grid">
          <div className="journey-panel">
            <div className="below-heading">
              <span className="section-number">02</span>
              <h2>Follow the reasoning</h2>
              <span className="small-tag">GAUSS–JORDAN</span>
            </div>
            <div className="journey-list" ref={historyRef}>
              <button
                className={`journey-step ${stepIndex === -1 ? "active" : ""}`}
                data-current={stepIndex === -1}
                onClick={() => {
                  setStepIndex(-1);
                  setPlaying(false);
                }}
              >
                <span className="journey-index">00</span>
                <span>
                  <strong>The starting point</strong>
                  <small>{sceneLabel}</small>
                </span>
                <span className="journey-status">
                  {stepIndex >= 0 ? <Check size={13} /> : <span />}
                </span>
              </button>
              {traceStart > 0 && (
                <div className="trace-window-note">
                  Earlier steps are available on the timeline.
                </div>
              )}
              {result.steps.slice(traceStart, traceEnd).map((s, offset) => {
                const i = traceStart + offset;
                return (
                  <button
                    key={i}
                    className={`journey-step ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "past" : ""}`}
                    data-current={i === stepIndex}
                    onClick={() => {
                      setStepIndex(i);
                      setPlaying(false);
                    }}
                  >
                    <span className="journey-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{s.title}</strong>
                      <small>{s.formula || s.explanation}</small>
                    </span>
                    <span className="journey-status">
                      {i < stepIndex ? (
                        <Check size={13} />
                      ) : i === stepIndex ? (
                        <span />
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {traceEnd < result.steps.length && (
                <div className="trace-window-note">
                  {result.steps.length - traceEnd} more steps · use the timeline
                  to explore every operation.
                </div>
              )}
            </div>
          </div>
          <div className="result-panel">
            <div className="below-heading">
              <span className="section-number">03</span>
              <h2>A moment of clarity</h2>
              <button
                className="icon-button"
                onClick={exportResult}
                aria-label="Export solution"
                title="Export exact results and every step as JSON"
              >
                <ArrowDownToLine size={15} />
              </button>
            </div>
            <div className="result-body">
              <div className="result-state">
                <span className="result-state-dot" />
                <span>
                  {result.solution?.kind === "inconsistent"
                    ? "NO SOLUTION"
                    : result.solution?.kind === "infinite"
                      ? "INFINITELY MANY SOLUTIONS"
                      : result.mode === "inverse" && !result.inverse
                        ? "SINGULAR MATRIX"
                        : result.solution
                          ? "UNIQUE SOLUTION"
                          : result.mode === "determinant"
                            ? "SIGNED VOLUME"
                            : result.mode === "inverse"
                              ? "INVERSE FOUND"
                              : "REDUCED ROW ECHELON FORM"}
                </span>
                <span className="computed-tag">
                  {dirty
                    ? "PREVIOUS INPUT"
                    : completed
                      ? "REVEALED"
                      : "COMPUTED"}
                </span>
              </div>
              {result.solution?.kind === "unique" && (
                <div className="solution-values">
                  {result.solution.particular?.slice(0, 24).map((v, i) => (
                    <div className="solution-value" key={i}>
                      <span>
                        x{sub(i + 1)} <span>=</span>
                      </span>
                      <strong>
                        <Scalar value={v} decimal={decimal} />
                      </strong>
                    </div>
                  ))}
                  {(result.solution.particular?.length ?? 0) > 24 && (
                    <p className="solution-preview-note">
                      First 24 unknowns shown. Export for the complete solution.
                    </p>
                  )}
                </div>
              )}
              {result.solution?.kind === "infinite" && (
                <div className="infinite-solution">
                  <p>Freedom is part of the answer.</p>
                  <div className="vector-expression">
                    x = (
                    {result.solution.particular?.slice(0, 12).join(", ") +
                      ((result.solution.particular?.length ?? 0) > 12
                        ? ", …"
                        : "")}
                    )
                    {result.solution.nullspace.slice(0, 3).map((v, i) => (
                      <span key={i}>
                        {" "}
                        + t{sub(i + 1)} ({v.slice(0, 12).join(", ")}
                        {v.length > 12 ? ", …" : ""})
                      </span>
                    ))}
                  </div>
                  <small>
                    Each t is any real number.
                    {(result.solution.nullspace.length > 3 ||
                      (result.solution.particular?.length ?? 0) > 12) &&
                      " Preview shown. Export for the complete parametric solution."}
                  </small>
                </div>
              )}
              {result.solution?.kind === "inconsistent" && (
                <div className="contradiction">
                  <span>0 ≠ b</span>
                  <p>
                    A zero row with a nonzero right-hand side.
                    <br />
                    These equations cannot all be true.
                  </p>
                </div>
              )}
              {result.mode === "determinant" && (
                <div className="det-result">
                  <span>det(A) = </span>
                  <strong>
                    <Scalar
                      value={result.determinant ?? "0"}
                      decimal={decimal}
                    />
                  </strong>
                </div>
              )}
              {result.mode === "inverse" && (
                <div className="inverse-result">
                  {result.inverse ? (
                    <>
                      <span>A⁻¹ =</span>
                      <div
                        className="result-matrix"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(result.inverse[0].length, 5)},1fr)`,
                        }}
                      >
                        {result.inverse.slice(0, 5).flatMap((r, ri) =>
                          r.slice(0, 5).map((v, ci) => (
                            <span key={`${ri}-${ci}`}>
                              <Scalar value={v} decimal={decimal} />
                            </span>
                          )),
                        )}
                      </div>
                      {result.inverse.length > 5 && (
                        <small>
                          First 5 × 5 shown. Export for the full inverse.
                        </small>
                      )}
                    </>
                  ) : (
                    <p>
                      This matrix has no inverse. Its rows are linearly
                      dependent.
                    </p>
                  )}
                </div>
              )}
              {result.mode === "rref" && (
                <div className="rref-result">
                  <span>rank(A) =</span>
                  <strong>{result.rank}</strong>
                  <p>
                    {result.pivotColumns.length} pivot{" "}
                    {result.pivotColumns.length === 1 ? "column" : "columns"} ·{" "}
                    {result.columns - result.rank} free{" "}
                    {result.columns - result.rank === 1 ? "column" : "columns"}
                  </p>
                </div>
              )}
              <div className="result-footnote">
                <span>
                  Rank <strong>{result.rank}</strong>
                </span>
                <span>
                  {result.determinant !== null ? (
                    <>
                      det{" "}
                      <strong>
                        {formatScalar(result.determinant, decimal)}
                      </strong>
                    </>
                  ) : (
                    <>
                      Size{" "}
                      <strong>
                        {result.rows} × {result.columns}
                      </strong>
                    </>
                  )}
                </span>
                <span>
                  <Check size={12} /> Exact rational arithmetic
                </span>
              </div>
            </div>
          </div>
        </section>
        <div className="studio-note">
          <span className="note-star">✳</span>
          <p>
            Not just the answer. <em>The beauty in getting there.</em>
          </p>
          <button onClick={() => setModal("method")}>
            A note on the mathematics <ArrowUpRight size={14} />
          </button>
        </div>
      </main>
      <footer className="site-footer">
        <span>
          SIMPLE JACK <span>/</span> A MATHEMATICAL OBSERVATORY
        </span>
        <span className="keyboard-hint">
          <kbd>space</kbd> play / pause <span>·</span> <kbd>←</kbd>
          <kbd>→</kbd> explore
        </span>
        <span>MADE OF NUMBERS. MOVED BY CURIOSITY.</span>
      </footer>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="toast"
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0, y: 15 }}
          >
            <Check size={16} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <dialog
        ref={dialogRef}
        className="dialog"
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setModal(null);
        }}
      >
        <div className="dialog-inner">
          <button
            className="dialog-close icon-button"
            aria-label="Close dialog"
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
          {modal === "import" ? (
            <>
              <span className="eyebrow">BRING YOUR OWN NUMBERS</span>
              <h2>A matrix, in your words.</h2>
              <p>
                Separate values with spaces, tabs, or commas. Put each row on a
                new line. JSON arrays work, too.
              </p>
              <textarea
                aria-label="Paste matrix values"
                autoFocus
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={"2  1  -1  8\n-3  -1  2  -11\n-2  1  2  -3"}
                spellCheck={false}
              />
              <p className="import-note">
                {mode === "solve" ? "Include b as the final column. " : ""}Up to
                16,384 cells, with exact fractions and decimals.
              </p>
              {importError && (
                <p className="input-error" role="alert">
                  {importError}
                </p>
              )}
              <button className="solve-button" onClick={applyImport}>
                <Clipboard size={16} />
                <span>Use this matrix</span>
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <>
              <span className="eyebrow">BEHIND THE BEAUTY</span>
              <h2>
                Small moves.
                <br />
                <em>Perfect clarity.</em>
              </h2>
              <p>
                Gauss–Jordan elimination turns a matrix into its reduced row
                echelon form through three moves: exchange two rows, scale a
                row, and add a multiple of one row to another. Each move
                preserves the solution set.
              </p>
              <div className="method-steps">
                <div>
                  <span>01</span>
                  <strong>Find a pivot</strong>
                  <p>
                    Choose a nonzero entry to anchor the next transformation.
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <strong>Create a one</strong>
                  <p>
                    Scale the pivot row until its leading entry becomes one.
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <strong>Make space</strong>
                  <p>
                    Clear the entries above and below. Repeat until the
                    structure appears.
                  </p>
                </div>
              </div>
              <p>
                Every displayed operation comes from the exact calculation.
                Fractions use arbitrary-precision integers; decimal view is an
                approximation. The sculpture is generative art responding to the
                progression, rather than a plot of the solution space.
              </p>
              <p className="method-limit">
                Any rectangular dimensions within a 16,384-cell browser budget.
                Exact arithmetic can grow quickly: large computations also have
                time, operation, and precision budgets. If a budget is reached,
                you’ll get an explicit error. No steps are silently skipped.
              </p>
              <button className="solve-button" onClick={() => setModal(null)}>
                <span>Back to the studio</span>
                <ArrowRight size={18} />
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
