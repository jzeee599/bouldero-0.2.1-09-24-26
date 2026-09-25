import { test, expect, type Page } from "@playwright/test";

async function upload(
  page: Page,
  width = 800,
  height = 1200,
  mode: "mapped" | "count_only" = "mapped",
) {
  await page.goto("/");
  await page.getByRole("button", { name: /New line/ }).click();
  // A generated image with visible hold-like dots makes tests self-contained.
  const bytes = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#b8b2a0";
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = i % 2 ? "#915574" : "#b3c269";
        ctx.beginPath();
        ctx.ellipse(
          width * (0.2 + (i % 3) * 0.28),
          height * (0.12 + Math.floor(i / 3) * 0.17),
          27,
          15,
          0.4,
          0,
          7,
        );
        ctx.fill();
      }
      return canvas.toDataURL("image/jpeg").split(",")[1];
    },
    { width, height },
  );
  await page
    .getByLabel("Choose a photo", { exact: true })
    .setInputFiles({
      name: "route.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(bytes, "base64"),
    });
  await page
    .getByRole("button", { name: mode === "mapped" ? /Map holds/ : /Count only/ })
    .click();
  await expect(page.getByTestId("photo-map").locator("img")).toBeVisible();
  await page
    .getByTestId("photo-map")
    .locator("img")
    .evaluate((img: HTMLImageElement) => img.decode());
}
async function add(page: Page, x: number, y: number) {
  const map = page.getByTestId("photo-map");
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  await map
    .locator("img")
    .click({ position: { x: box.width * x, y: box.height * y } });
}
async function assertPosition(page: Page, index: number, x: number, y: number) {
  const map = (await page.getByTestId("photo-map").boundingBox())!;
  const marker = (await page.getByTestId(`hold-${index}`).boundingBox())!;
  expect(
    Math.abs((marker.x + marker.width / 2 - map.x) / map.width - x),
  ).toBeLessThan(0.005);
  expect(
    Math.abs((marker.y + marker.height / 2 - map.y) / map.height - y),
  ).toBeLessThan(0.005);
}

test("15 holds survive save, reload, and phone/desktop/landscape resizing", async ({
  page,
}) => {
  await upload(page);
  const points = Array.from({ length: 15 }, (_, i) => ({
    x: 0.2 + (i % 3) * 0.28,
    y: 0.12 + Math.floor(i / 3) * 0.17,
  }));
  for (const point of points) await add(page, point.x, point.y);
  await expect(page.getByRole("button", { name: /^Hold / })).toHaveCount(15);
  await page.getByLabel("Color").fill("Purple");
  await page.getByLabel("Grade", { exact: true }).fill("V4");
  await page.getByRole("button", { name: /Finish hold/ }).click();
  await page.getByRole("button", { name: /Done · Save line/ }).click();
  await expect(
    page.getByRole("heading", { name: "Purple V4" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Purple V4/ }).click();
  for (const size of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
    { width: 844, height: 390 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(size);
    for (const [i, point] of points.entries())
      await assertPosition(page, i + 1, point.x, point.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Hold 15, TOP", exact: true }),
  ).toBeVisible();
});

test("drag, keyboard nudge, delete, undo, and TOP semantics", async ({
  page,
}) => {
  await upload(page, 1200, 800);
  await add(page, 0.2, 0.3);
  await add(page, 0.5, 0.5);
  await add(page, 0.8, 0.7);
  await page.getByRole("button", { name: /Finish hold/ }).click();
  await expect(
    page.getByRole("button", { name: "Hold 3, TOP", exact: true }),
  ).toBeVisible();
  const marker = page.getByTestId("hold-1");
  await marker.scrollIntoViewIfNeeded();
  let box = (await page.getByTestId("photo-map").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4, {
    steps: 5,
  });
  await page.mouse.up();
  await assertPosition(page, 1, 0.35, 0.4);
  await marker.focus();
  await page.keyboard.press("ArrowRight");
  await assertPosition(page, 1, 0.355, 0.4);
  await page.getByTestId("hold-2").click();
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(
    page.getByRole("button", { name: "Hold 2, TOP", exact: true }),
  ).toBeVisible();
  await add(page, 0.5, 0.8);
  await expect(page.getByRole("button", { name: /Finish hold/ })).toHaveClass(/selected-result/);
  await page.getByRole("button", { name: "Undo last hold" }).click();
  await expect(page.getByRole("button", { name: /^Hold / })).toHaveCount(2);
  await page.getByTestId("hold-1").scrollIntoViewIfNeeded();
  box = (await page.getByTestId("photo-map").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.355, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x - 15, box.y + box.height * 0.2, { steps: 5 });
  await page.mouse.up();
  await assertPosition(page, 1, 0, 0.2);
});

test("requires color, grade, and hold; failed persistence retains editable draft", async ({
  page,
}) => {
  await upload(page);
  const save = page.getByRole("button", { name: /Done · Save line/ });
  await expect(save).toBeDisabled();
  await page.getByLabel("Color").fill("Orange");
  await page.getByLabel("Grade", { exact: true }).fill("V3");
  await expect(save).toBeDisabled();
  await add(page, 0.5, 0.5);
  await expect(save).toBeEnabled();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      IDBObjectStore.prototype.put = original;
      throw new Error("Test: storage full");
    };
  });
  await save.click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "storage full",
  );
  await expect(page.getByLabel("Color")).toHaveValue("Orange");
  await expect(page.getByTestId("hold-1")).toBeVisible();
  await save.click();
  await expect(
    page.getByRole("heading", { name: "Orange V3" }),
  ).toBeVisible();
});

test("invalid image reports an actionable error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /New line/ }).click();
  await page
    .getByLabel("Choose a photo", { exact: true })
    .setInputFiles({
      name: "broken.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("not an image"),
    });
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "could not be opened",
  );
});

test("starts a gym session and persists an attempt with notes", async ({ page }) => {
  await upload(page);
  await add(page, 0.4, 0.6);
  await add(page, 0.55, 0.35);
  await page.getByLabel("Color").fill("Green");
  await page.getByLabel("Grade", { exact: true }).fill("V2");
  await page.getByLabel("Gym optional").fill("Test Gym");
  await page.getByRole("button", { name: /Done · Save line/ }).click();
  await page.getByRole("button", { name: /All lines/ }).click();

  await page.getByRole("button", { name: /Start a session/ }).click();
  await page.getByLabel("Gym", { exact: true }).fill("Test Gym");
  await page.getByRole("button", { name: /Start session/ }).click();
  await expect(page.getByText("SESSION IN PROGRESS")).toBeVisible();
  await expect(page.getByLabel("Session elapsed time")).toContainText(/00:00:0/);
  await page.getByRole("button", { name: /Green V2/ }).click();
  await page.locator(".attempt-hold-picker").getByTestId("hold-1").click();
  await page.getByRole("button", { name: /Add attempt/ }).click();
  await expect(page.getByText("#1 · Attempted")).toBeVisible();
  await expect(page.locator(".attempt-history").getByText("Reached hold 1")).toBeVisible();
  await page.getByRole("button", { name: "Sent" }).click();
  await page.getByLabel("Notes optional").fill("Kept my hips close on the last move.");
  await page.getByRole("button", { name: /Add attempt/ }).click();

  await expect(page.getByText("#2 · Sent")).toBeVisible();
  await expect(page.locator(".pill")).toHaveText("Completed");
  await expect(page.locator(".attempt-history").getByText("Reached hold 2")).toBeVisible();
  await expect(page.getByText("Kept my hips close on the last move.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Completed 1/ }).click();
  await page.getByRole("button", { name: /Green V2/ }).click();
  await expect(page.getByText("#2 · Sent")).toBeVisible();
});

test("reuses one photo for a count-only warm-up line", async ({ page }) => {
  await upload(page);
  await add(page, 0.5, 0.5);
  await page.getByLabel("Color").fill("Red");
  await page.getByLabel("Grade", { exact: true }).fill("V1");
  await page.getByLabel("Gym optional").fill("Test Gym");
  await page.getByRole("button", { name: /Done · Save line/ }).click();

  await page.getByRole("button", { name: /Create another line from this photo/ }).click();
  await page.getByRole("button", { name: /Count only/ }).click();
  await expect(page.getByText("Count-only line — no markers needed.")).toBeVisible();
  await page.getByLabel("Color").fill("Yellow");
  await page.getByLabel("Grade", { exact: true }).fill("V0");
  await page.getByRole("button", { name: /Done · Save line/ }).click();
  await expect(page.getByText("Attempts only")).toBeVisible();

  const stored = await page.evaluate(async () => {
    const request = indexedDB.open("bouldero-v1", 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const get = db.transaction("projects", "readonly").objectStore("projects").getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return rows.map((row) => ({
      name: row.name,
      hasPhoto: row.photo instanceof Blob,
      source: row.source_project_id,
      mode: row.route_mode,
    }));
  });
  expect(stored.find((row) => row.name === "Red V1")?.hasPhoto).toBe(true);
  expect(stored.find((row) => row.name === "Yellow V0")).toMatchObject({
    hasPhoto: false,
    mode: "count_only",
  });
  expect(stored.find((row) => row.name === "Yellow V0")?.source).toBeTruthy();

  await page.getByRole("button", { name: /All lines/ }).click();
  await page.getByRole("button", { name: /Start a session/ }).click();
  await page.getByLabel("Gym", { exact: true }).fill("Test Gym");
  await page.getByRole("button", { name: /Start session/ }).click();
  await page.getByRole("button", { name: /Yellow V0/ }).click();
  await page.getByRole("button", { name: /Add attempt/ }).click();
  await page.getByRole("button", { name: /Add attempt/ }).click();
  await expect(page.getByText("Total attempts").locator("..")).toContainText("2");
});

test("filters, lists, completes, archives, and restores lines", async ({ page }) => {
  await upload(page);
  await add(page, 0.45, 0.55);
  await page.getByLabel("Color").fill("Blue");
  await page.getByLabel("Grade", { exact: true }).fill("V5");
  await page.getByLabel("Gym optional").fill("Library Gym");
  await page.getByRole("button", { name: /Done · Save line/ }).click();

  await page.getByRole("button", { name: "Mark completed" }).click();
  await expect(page.locator(".pill")).toHaveText("Completed");
  await page.getByRole("button", { name: /All lines/ }).click();
  await expect(page.getByRole("button", { name: /Blue V5/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Completed 1/ }).click();
  await expect(page.getByRole("button", { name: /Blue V5/ })).toBeVisible();

  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".project-grid")).toHaveClass(/list-view/);
  await page.getByLabel("Filter by gym").selectOption("Library Gym");
  await page.getByLabel("Search lines").fill("missing");
  await expect(page.getByRole("heading", { name: "No lines match." })).toBeVisible();
  await page.getByLabel("Search lines").fill("blue");
  await page.getByRole("button", { name: /Blue V5/ }).click();

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".pill")).toHaveText("Archived");
  await page.getByRole("button", { name: "Move to ongoing" }).click();
  await expect(page.locator(".pill")).toHaveText("Ongoing");
});

test("shows session history, timeline notes, and line progress", async ({ page }) => {
  await upload(page);
  await add(page, 0.4, 0.6);
  await page.getByLabel("Color").fill("Black");
  await page.getByLabel("Grade", { exact: true }).fill("V6");
  await page.getByLabel("Gym optional").fill("History Gym");
  await page.getByRole("button", { name: /Top out/ }).click();
  await page.getByRole("button", { name: /Done · Save line/ }).click();
  await page.getByRole("button", { name: /All lines/ }).click();
  await page.getByRole("button", { name: /Start a session/ }).click();
  await page.getByLabel("Gym", { exact: true }).fill("History Gym");
  await page.getByRole("button", { name: /Start session/ }).click();
  await page.getByRole("button", { name: /Black V6/ }).click();
  await page.getByLabel("Notes optional").fill("Matched the final hold with control.");
  await page.getByRole("button", { name: "Sent" }).click();
  await expect(page.locator(".attempt-hold-picker > strong")).toHaveText("Reached TOP OUT");
  await page.getByRole("button", { name: /Add attempt/ }).click();
  await page.getByRole("button", { name: /All lines/ }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "History" }).click();

  await expect(page.getByRole("heading", { name: "Session timeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "History Gym" })).toBeVisible();
  await expect(page.locator(".session-summary")).toContainText("1 attempts");
  await expect(page.locator(".session-summary")).toContainText("1 sends");
  await expect(page.getByText("“Matched the final hold with control.”")).toBeVisible();
  await page.getByRole("button", { name: /Black V6/ }).click();
  await expect(page.locator(".attempt-history").getByText("Reached TOP OUT")).toBeVisible();
  await expect(page.getByText(/History Gym ·/)).toBeVisible();
  await expect(page.getByText("Sends recorded").locator("..")).toContainText("1");
});
