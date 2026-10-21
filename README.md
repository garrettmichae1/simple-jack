# Simple Jack

**The art of finding x.** An interactive linear algebra studio that pairs exact arithmetic with a moving, procedural mathematical sculpture. Enter a matrix, choose an operation, and explore every elementary row operation on a scrubbable timeline.

Built with React, TypeScript, Vite, and a custom Canvas renderer. The application runs entirely in your browser; matrix values are not uploaded to a server.

[Hosted studio (owner sign-in)](https://simple-jack-matrix-studio.garrettmichae1.chatgpt.site)

## The name

The original words behind the project:

> Being simple ain't worth jack.  
> Simple ain't Jack.  
> Jack ain't simple.  
> Jack being worth ain't simple.  
> Ain't simple being worth Jack.  
> Worth Jack simple being Ain't.  
> skip, bop, switch, swing, ain't jack.

## Run locally

Use Node.js 22.12 or newer (Node.js 24 is also supported).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To produce and serve a production build:

```sh
npm run build
npm run preview
```

`dist/` contains the static application and can be deployed to a static web host. Relative asset paths allow hosting beneath a repository path as well as at a domain root.

## Explore a matrix

1. Choose an operation and set the dimensions. For a system, dimensions mean **equations × unknowns**; the editor adds the right-hand-side column automatically.
2. Edit individual cells, paste a matrix, randomize the entries, or choose an example. Paste accepts space-, tab-, or comma-separated values, semicolon- or newline-separated rows, and JSON arrays. For a system, pasted input must include `b` as its final column. JSON numeric tokens preserve their original precision.
3. Select **Let it unfold**. The complete result is calculated first, then its elementary operations play back in order.
4. Pause, move one step at a time, scrub the timeline, change the tempo, or select an operation in **Follow the reasoning**. Long traces display a bounded window around the playhead to keep the interface responsive; the timeline reaches every step and the export contains the full trace. Large matrices have row and column viewport controls; the calculation still uses the entire matrix.
5. Export the solution to download JSON containing exact results and the full operation trace. The decimal display is only a reading aid; exports retain exact fractions.

Outside form controls, **Space** plays or pauses, **← / →** step backward or forward, and **Escape** leaves focus view. Native dialogs, labeled inputs, keyboard controls, and reduced-motion preferences support accessible exploration.

The animated sculpture is procedural art responding to the progress of the calculation. It is not a geometric plot of the solution space.

## Mathematics

| Operation      | Input                                                                  | Result                                                                           |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Solve a system | An augmented matrix `[A ∣ b]`; the final column is the right-hand side | A unique solution, a parameterized family, or an inconsistent-system explanation |
| Row reduction  | Any nonempty rectangular matrix                                        | Reduced row echelon form, rank, and the full elimination trace                   |
| Determinant    | A square matrix                                                        | An exact determinant, including row-swap and scaling effects                     |
| Inverse        | A square matrix                                                        | The inverse from reducing `[A ∣ I]`, or a singular-matrix result                 |

Values may be integers, decimals, fractions such as `2/3`, or scientific notation such as `1e-3`. Arithmetic uses reduced `BigInt` fractions throughout the solver. Changing the display to decimals does not change the underlying calculation.

Gaussian elimination with exact arithmetic produces a complete sequence of pivot selections, row swaps, row scaling, and elimination operations. Each recorded operation stores only the changed rows, allowing the animation to reconstruct any point in the calculation without storing an entire matrix for every step. Computation runs in a Web Worker so the interface remains responsive.

## Dimensions and practical limits

Rows and columns are configurable independently; the solver is not restricted to the example sizes. Rectangular systems, overdetermined systems, underdetermined systems, and zero matrices are supported.

“Any size” is necessarily bounded by the browser's memory and available computation. The solver currently enforces these budgets:

- 16,384 input cells and 1,000,000 input characters.
- 2,048 decimal digits per exact numerator or denominator.
- 4,000,000 charged arithmetic operations.
- 2,000,000 recorded row-update cells and 16,000,000 trace characters.
- 2,000,000 entries in a complete parametric solution.
- A 30-second worker timeout in the browser interface; calculations can also be canceled.

These are maximum resource budgets, not a guarantee that every matrix below the input-cell limit will finish: dense matrices and rapidly growing fractions may exhaust another budget first. The application reports an error if a problem exceeds a budget. It does not silently omit operations or substitute an approximate answer. Dense exact elimination becomes expensive as dimensions and fraction sizes grow; this is a visual, exact linear algebra tool rather than a distributed numerical-computing package.

Complex-valued matrices, symbolic coefficients, eigenvalue decomposition, and nonlinear equations are outside the current scope.

## Development

```sh
npm test          # Exact arithmetic, systems, matrix operations, and trace tests
npm run build    # Type checking and optimized production bundle
npm run test:watch
```

For browser-level verification:

```sh
npx playwright install chromium
npm run test:e2e
```

The six browser tests cover playback and exact exports, solution types, imported values and errors, rectangular dimensions, matrix operations, and mobile keyboard access. The suite starts Vite automatically, or reuses an existing local development server. It uses `/usr/bin/chromium` when available; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select another installed Chromium executable.

GitHub Actions runs the mathematical tests, production build, and browser suite on pushes and pull requests.

The mathematical tests include unique, infinite, and inconsistent systems; exact decimal and fractional inputs; rectangular RREF; determinant parity; inverse products; deterministic generated systems; input validation; and replay of every recorded row operation.

## Project structure

- `src/math.ts` — Exact rational arithmetic, validation, elimination, and replay.
- `src/solver.worker.ts` — Worker entry point for asynchronous calculations.
- `src/App.tsx` — Matrix editor, operation selection, result display, and playback controls.
- `src/components/MathScene.tsx` — Procedural mathematical artwork and responsive motion.
- `src/styles.css` — Responsive interface and visual design.
- `src/math.test.ts` — Mathematical correctness and parser tests.
- `tests/studio.pw.ts` — Browser behavior, real worker calculations, export, and responsive-layout checks.
