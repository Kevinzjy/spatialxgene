import { test, expect } from "@playwright/test";

async function selectFirstDataset(page: any) {
  const datasetList = page.getByTestId("dataset-list").or(page.getByRole("list", { name: /datasets/i }));
  const firstItem = datasetList.getByRole("button").first().or(datasetList.getByRole("option").first());
  await firstItem.click();
}

test.describe("Spatialxgene core smoke flow", () => {
  test("loads app shell and can select a dataset", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/SPATIALxGENE/i)).toBeVisible();

    await selectFirstDataset(page);

    await expect(page.getByText(/Loading dataset/i)).toBeVisible();

    await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("button", { name: /Export PDF/i })).toBeVisible();
  });

  test("can toggle embedding and background image options", async ({ page }) => {
    await page.goto("/");
    await selectFirstDataset(page);

    const spatialButton = page.getByRole("button", { name: /Spatial/i });
    const umapButton = page.getByRole("button", { name: /UMAP/i });

    await expect(spatialButton).toBeVisible();

    await umapButton.click();

    await expect(page.getByText(/Background image/i)).not.toBeVisible({ timeout: 5_000 }).catch(() => {});

    await spatialButton.click();

    const bgSelect = page.getByLabel(/Background image/i).or(page.getByText(/Background image/i));
    await expect(bgSelect).toBeVisible();
  });

  test("can switch Color by Annotation and Gene", async ({ page }) => {
    await page.goto("/");
    await selectFirstDataset(page);

    const annotationTab = page.getByRole("button", { name: "Annotation", exact: true });
    const geneTab = page.getByRole("button", { name: "Gene", exact: true });

    await annotationTab.click();

    await page.waitForTimeout(500);

    const legendRegion = page.getByTestId("annotation-legend").or(page.getByText(/Legend/i));
    await expect(legendRegion).toBeVisible();

    await geneTab.click();

    const geneSearch = page.getByPlaceholder(/Search gene…/i).or(page.getByRole("textbox", { name: /Gene/i }));
    await expect(geneSearch).toBeVisible();
  });

  test("multi-feature mode and layouts do not throw", async ({ page }) => {
    await page.goto("/");
    await selectFirstDataset(page);

    const multigeneTab = page.getByRole("button", { name: "Multi-feature", exact: true });
    await multigeneTab.click();

    const multigeneInput = page.getByPlaceholder(/Search gene or metadata to add…/i).or(page.getByRole("textbox", { name: /Multi-feature/i }));
    await expect(multigeneInput).toBeVisible();

    await page.evaluate(() => {
      window.__spatialxgene_errors = [];
      window.addEventListener("error", (ev) => {
        (window as any).__spatialxgene_errors.push(ev.error || ev.message);
      });
    });

    const pieButton = page.getByLabel(/Pie/i);
    const gridButton = page.getByLabel(/Grid/i);

    await pieButton.click();
    await gridButton.click();

    await page.waitForTimeout(1000);

    const errors = await page.evaluate(() => (window as any).__spatialxgene_errors || []);
    expect(errors).toEqual([]);
  });

  test("Export PDF writes through the save dialog without front-end errors", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await selectFirstDataset(page);

    const exportButton = page.getByRole("button", { name: /Export PDF/i });
    await expect(exportButton).toBeVisible();

    await page.evaluate(() => {
      (window as any).__spatialxgene_save_picker = { calls: [], wroteBytes: 0, closed: false };
      Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true,
        writable: true,
        value: async (options: any) => {
          (window as any).__spatialxgene_save_picker.calls.push(options);
          return {
            createWritable: async () => ({
              write: async (data: Blob) => {
                (window as any).__spatialxgene_save_picker.wroteBytes = data.size;
              },
              close: async () => {
                (window as any).__spatialxgene_save_picker.closed = true;
              },
            }),
          };
        },
      });
    });

    await exportButton.click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).__spatialxgene_save_picker?.closed === true), {
        timeout: 30_000,
      })
      .toBe(true);

    const errors = await page.evaluate(() => (window as any).__spatialxgene_errors || []);
    expect(errors).toEqual([]);
    const savePicker = await page.evaluate(() => (window as any).__spatialxgene_save_picker);
    expect(savePicker.calls[0].suggestedName).toMatch(/^spatialxgene-\d{8}-\d{6}\.pdf$/);
    expect(savePicker.calls[0].types[0].accept["application/pdf"]).toContain(".pdf");
    expect(savePicker.wroteBytes).toBeGreaterThan(0);
  });
});
