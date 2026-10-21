import { expect, test, type Page } from "@playwright/test";

async function importMatrix(page: Page, text: string) {
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByLabel("Paste matrix values").fill(text);
  await page.getByRole("button", { name: "Use this matrix" }).click();
}

async function solve(page: Page) {
  await page.getByRole("button", { name: "Let it unfold" }).click();
  await expect(
    page.getByRole("button", { name: "Let it unfold" }),
  ).toBeVisible();
}

async function example(page: Page, name: string) {
  await page.getByRole("button", { name: "Explore an example" }).click();
  await page.getByRole("button", { name }).click();
  await expect(
    page.getByRole("button", { name: "Let it unfold" }),
  ).toBeVisible();
}

test("plays and exports a complete exact solution without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".solution-value strong")).toHaveText([
    "2",
    "3",
    "−1",
  ]);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator(".step-counter strong")).toHaveText("01");
  await page.getByRole("button", { name: "Jump to result" }).click();
  await expect(page.locator(".computed-tag")).toHaveText("REVEALED");
  await expect
    .poll(async () =>
      page.locator(".journey-list").evaluate((list) => {
        const active = list.querySelector('[data-current="true"]')!;
        const outer = list.getBoundingClientRect();
        const inner = active.getBoundingClientRect();
        return inner.top >= outer.top && inner.bottom <= outer.bottom + 1;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Rewind to start" }).click();
  await expect(page.locator(".step-counter strong")).toHaveText("00");
  await page.getByLabel("Animation speed").selectOption("4");
  await page.getByRole("button", { name: "Play animation" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".step-counter strong")).not.toHaveText("00");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: "Pause animation" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export solution" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("simple-jack-solution.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(data.arithmetic).toBe("exact rational");
  expect(data.solution.particular).toEqual(["2", "3", "-1"]);
  expect(data.steps.at(-1).type).toBe("complete");
  expect(data.final).toEqual([
    ["1", "0", "0", "2"],
    ["0", "1", "0", "3"],
    ["0", "0", "1", "-1"],
  ]);
  expect(errors).toEqual([]);
});

test("explains infinite, inconsistent, invertible, and determinant examples", async ({
  page,
}) => {
  await page.goto("/");
  await example(page, "Infinite possibilities");
  await expect(page.locator(".result-state")).toContainText(
    "INFINITELY MANY SOLUTIONS",
  );
  await expect(page.locator(".vector-expression")).toContainText("t₁");
  await example(page, "A beautiful contradiction");
  await expect(page.locator(".result-state")).toContainText("NO SOLUTION");
  await example(page, "Find the inverse");
  await expect(page.locator(".result-state")).toContainText("INVERSE FOUND");
  await expect(page.locator(".result-matrix > span")).toHaveCount(9);
  await example(page, "Signed volume");
  await expect(page.locator(".det-result strong")).toHaveText("21");
});

test("imports exact fractions and keeps invalid edits distinct from old results", async ({
  page,
}) => {
  await page.goto("/");
  await importMatrix(page, "1/2 0 1\n0 3 6");
  await solve(page);
  await expect(page.locator(".solution-value strong")).toHaveText(["2", "2"]);
  await page
    .getByLabel("Row 1, column 1", { exact: true })
    .fill("not-a-number");
  await expect(page.locator(".computed-tag")).toHaveText("PREVIOUS INPUT");
  await solve(page);
  await expect(page.getByRole("alert")).toContainText("not a number");
  await expect(page.locator(".solution-value strong")).toHaveText(["2", "2"]);
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByLabel("Paste matrix values").fill("1,,2");
  await page.getByRole("button", { name: "Use this matrix" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "value",
  );
});

test("supports rectangular dimensions, viewport navigation, and honest size errors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("OPERATION").selectOption("rref");
  const matrix = Array.from({ length: 17 }, (_, r) =>
    Array.from({ length: 19 }, (_, c) => (r === c ? "1" : "0")).join(" "),
  ).join("\n");
  await importMatrix(page, matrix);
  await solve(page);
  await expect(page.locator(".rref-result > strong")).toHaveText("17");
  await page.getByRole("button", { name: "Next rows" }).click();
  await expect(page.locator(".matrix-viewport")).toContainText("Rows 8–14");
  await page.getByRole("button", { name: "Next columns" }).click();
  await expect(page.locator(".matrix-viewport")).toContainText("cols 10–18");
  await page.getByLabel("OPERATION").selectOption("inverse");
  await expect(page.locator(".large-input strong")).toHaveText(
    "17 × 19 matrix loaded",
  );
  await solve(page);
  await expect(page.getByRole("alert")).toContainText("square matrix");
  await page.getByLabel("Number of rows").fill("129");
  await page.getByLabel("Number of columns").fill("129");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("16,384");
});

test("renders square RREF, a singular inverse, and a negative determinant", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("OPERATION").selectOption("rref");
  await solve(page);
  await expect(page.locator(".rref-result > strong")).toHaveText("3");
  await page.getByLabel("OPERATION").selectOption("inverse");
  await importMatrix(page, "1 2\n2 4");
  await solve(page);
  await expect(page.locator(".result-state")).toContainText("SINGULAR MATRIX");
  await page.getByLabel("OPERATION").selectOption("determinant");
  await importMatrix(page, "0 1\n1 0");
  await solve(page);
  await expect(page.locator(".det-result strong")).toHaveText("−1");
});

test("works at mobile width with keyboard-accessible dialogs and no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "The method" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Enter focus view" }).click();
  await expect(page.locator(".input-panel")).not.toBeVisible();
  await page.getByRole("button", { name: "Exit focus view" }).click();
  await expect(page.locator(".input-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
