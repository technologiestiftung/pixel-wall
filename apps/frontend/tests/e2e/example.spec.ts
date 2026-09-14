import { test, expect, type Locator } from "@playwright/test";

/** Decodes the actual rendered pixel color from a screen tile's bitmap <img>. */
async function samplePixel(img: Locator, x = 0, y = 0): Promise<[number, number, number, number]> {
	return img.evaluate(
		(el: HTMLImageElement, [px, py]) =>
			new Promise<[number, number, number, number]>((resolve) => {
				const draw = () => {
					const canvas = document.createElement("canvas");
					canvas.width = el.naturalWidth;
					canvas.height = el.naturalHeight;
					const ctx = canvas.getContext("2d")!;
					ctx.drawImage(el, 0, 0);
					const data = ctx.getImageData(px, py, 1, 1).data;
					resolve([data[0], data[1], data[2], data[3]]);
				};
				if (el.complete) draw();
				else el.onload = draw;
			}),
		[x, y],
	);
}

test("has title", async ({ page }) => {
	await page.goto("/");

	await expect(page).toHaveTitle("Pixel Displays Foyer");
});

test("has h1", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByRole("heading", { name: "Pixel Displays Foyer", level: 1 })).toBeVisible();
});

test("selecting a screen updates the selection status", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByText("Kein Bildschirm ausgewählt")).toBeVisible();

	await page.getByRole("button", { name: /Bildschirm 02/ }).click();

	await expect(page.getByText("1 Bildschirm ausgewählt")).toBeVisible();
});

test("editing text and saving renders it on the screen, and it persists after deselecting", async ({ page }) => {
	await page.goto("/");

	const saveButton = page.getByRole("button", { name: "Speichern" });
	await expect(saveButton).toBeDisabled();

	const screen03 = page.getByRole("button", { name: /Bildschirm 03/ });
	await screen03.click();

	await page.getByLabel("Text", { exact: true }).fill("HALLO");
	await expect(saveButton).toBeEnabled();
	await expect(screen03.locator("img")).toHaveCount(1);

	await saveButton.click();
	await expect(page.getByRole("button", { name: "Auswahl aufheben" })).toBeVisible();
	await page.getByRole("button", { name: "Auswahl aufheben" }).click();

	await expect(page.getByText("Kein Bildschirm ausgewählt")).toBeVisible();
	await expect(screen03.locator("img")).toHaveCount(1);
});

test("a large-screen selection splits a solid color across both screens", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 02/ }).click();
	await page.getByRole("button", { name: /Bildschirm 06/ }).click();
	await expect(page.getByText("2 Bildschirme ausgewählt")).toBeVisible();

	await page.getByRole("tab", { name: "Farbe" }).click();
	await page.getByLabel("#FE4441").click();

	const screen02 = page.getByRole("button", { name: /Bildschirm 02/ });
	const screen06 = page.getByRole("button", { name: /Bildschirm 06/ });
	await expect(screen02.locator("img")).toHaveCount(1);
	await expect(screen06.locator("img")).toHaveCount(1);

	const [r1, g1, b1] = await samplePixel(screen02.locator("img"));
	const [r2, g2, b2] = await samplePixel(screen06.locator("img"));
	expect([r1, g1, b1]).toEqual([254, 68, 65]);
	expect([r2, g2, b2]).toEqual([254, 68, 65]);
});

test("saving goes through a real network round-trip, not just local state", async ({ page }) => {
	await page.goto("/");

	const screen03 = page.getByRole("button", { name: /Bildschirm 03/ });
	await screen03.click();
	await page.getByRole("tab", { name: "Farbe" }).click();
	await page.getByLabel("#B4B9FF").click();

	const applyRequestPromise = page.waitForRequest((req) => req.url().includes("/api/apply") && req.method() === "POST");
	await page.getByRole("button", { name: "Speichern" }).click();
	const applyRequest = await applyRequestPromise;
	const body = applyRequest.postDataJSON();

	await expect(page.getByRole("button", { name: "Speichern" })).toHaveText("Speichern");
	expect(body.selectionKind).toBe("small");
	expect(body.screens).toEqual([{ screenId: "03", geometry: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 } }]);
	expect(body.content.bitmap).toMatch(/^data:image\/png/);

	// Confirm the (mocked) backend actually now has it, via a fresh fetch —
	// not just trusting client-side state.
	const state = await page.evaluate(() => fetch("/api/state").then((r) => r.json()));
	expect(state.screens["03"].content.bitmap).toBe(body.content.bitmap);
});

test("selecting a small and a large screen together is rejected as mixed-kind", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 01/ }).click();
	await expect(page.getByText("1 Bildschirm ausgewählt")).toBeVisible();

	// 02 is large, 01 is small — this must start a fresh selection, not extend it.
	await page.getByRole("button", { name: /Bildschirm 02/ }).click();
	await expect(page.getByText("1 Bildschirm ausgewählt")).toBeVisible();
});

test("layout edit mode disables selection and shows the drag instructions", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("button", { name: "Layout bearbeiten" }).click();
	await expect(page.getByRole("heading", { name: "Layout bearbeiten" })).toBeVisible();
	await expect(page.getByText(/Ziehe die Bildschirme/)).toBeVisible();

	// Clicking a screen in layout-edit mode must not select it.
	await page.getByRole("button", { name: /Bildschirm 02/ }).click();
	await expect(page.getByText(/Bildschirm.*ausgewählt/)).not.toBeVisible();

	await page.getByRole("button", { name: "Layout fertig" }).click();
	await expect(page.getByRole("heading", { name: "Inhalte hinzufügen" })).toBeVisible();
});

test("dragging a screen moves it and persists the new layout to the backend", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Layout bearbeiten" }).click();

	const screen07 = page.getByRole("button", { name: /Bildschirm 07/ });
	const before = (await screen07.boundingBox())!;

	const putPromise = page.waitForRequest((req) => req.url().includes("/api/layout") && req.method() === "PUT");
	await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
	await page.mouse.down();
	await page.mouse.move(before.x + before.width / 2 - 80, before.y + before.height / 2 - 80, { steps: 10 });
	await page.mouse.up();
	const putRequest = await putPromise;

	const after = (await screen07.boundingBox())!;
	expect(after.x).toBeLessThan(before.x);
	expect(after.y).toBeLessThan(before.y);

	const body = putRequest.postDataJSON();
	const persisted = body.positions.find((p: { screenId: string }) => p.screenId === "07");
	expect(persisted).toBeTruthy();

	// Confirm the (mocked) backend actually now has it, via a fresh fetch —
	// not just trusting client-side state. (A reload isn't used here: the
	// mock's in-memory layout lives in the service worker's own module
	// scope, which the browser can terminate and respawn at any time,
	// losing that in-memory state — a known limitation of a memory-only
	// mock, not of the frontend's persistence logic itself.)
	const layoutNow = await page.evaluate(() => fetch("/api/layout").then((r) => r.json()));
	const persistedNow = layoutNow.positions.find((p: { screenId: string }) => p.screenId === "07");
	expect(persistedNow).toEqual(persisted);
});

test("dragging a screen onto another screen's position is prevented (no overlap)", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Layout bearbeiten" }).click();

	const screen07 = page.getByRole("button", { name: /Bildschirm 07/ });
	const screen04 = page.getByRole("button", { name: /Bildschirm 04/ });
	const start = (await screen07.boundingBox())!;
	const target = (await screen04.boundingBox())!;

	await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
	await page.mouse.down();
	await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
	await page.mouse.up();

	const finalRect07 = (await screen07.boundingBox())!;
	const finalRect04 = (await screen04.boundingBox())!;
	const overlaps =
		finalRect07.x < finalRect04.x + finalRect04.width &&
		finalRect07.x + finalRect07.width > finalRect04.x &&
		finalRect07.y < finalRect04.y + finalRect04.height &&
		finalRect07.y + finalRect07.height > finalRect04.y;
	expect(overlaps).toBe(false);
});

test("the preview never needs to scroll, even in a fairly small window", async ({ page }) => {
	// Narrower/shorter than the original design, but still wide enough for
	// the (currently fixed-width) menu sidebar — a separate concern from
	// what's being tested here, which is the Stage itself never scrolling.
	await page.setViewportSize({ width: 900, height: 600 });
	await page.goto("/");

	const preview = page.locator("section", { has: page.getByText("Vorschau") });
	const scrollable = await preview.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
	expect(scrollable).toBe(false);

	// All 7 screens are still present, just scaled down to fit.
	for (const id of ["01", "02", "03", "04", "05", "06", "07"]) {
		await expect(page.getByRole("button", { name: new RegExp(`Bildschirm ${id}`) })).toBeVisible();
	}
});
