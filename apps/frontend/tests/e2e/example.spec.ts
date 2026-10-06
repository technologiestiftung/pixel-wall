import { test, expect, type Locator } from "@playwright/test";

/** Decodes the actual rendered pixel color from a screen tile's bitmap <img>. */
async function samplePixel(
	img: Locator,
	x = 0,
	y = 0,
): Promise<[number, number, number, number]> {
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

	await expect(page).toHaveTitle("CityLAB Pixel Screens");
});

test("has h1", async ({ page }) => {
	await page.goto("/");

	await expect(
		page.getByRole("heading", { name: "CityLAB Pixel Screens", level: 1 }),
	).toBeVisible();
});

test("selecting a screen updates the selection status", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByText("Kein Bildschirm ausgewählt")).toBeVisible();

	await page.getByRole("button", { name: /Bildschirm 2/ }).click();

	await expect(page.getByText("Bildschirm 2 ausgewählt")).toBeVisible();
});

test("editing text and saving renders it on the screen, and it persists after deselecting", async ({
	page,
}) => {
	await page.goto("/");

	const saveButton = page.getByRole("button", { name: "Speichern" });
	await expect(saveButton).toBeDisabled();

	const screen03 = page.getByRole("button", { name: /Bildschirm 3/ });
	await screen03.click();

	await page.getByLabel("Text", { exact: true }).fill("HALLO");
	await expect(saveButton).toBeEnabled();
	await expect(screen03.locator("img")).toHaveCount(1);

	await saveButton.click();
	await expect(
		page.getByRole("button", { name: "Auswahl aufheben" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Auswahl aufheben" }).click();

	await expect(page.getByText("Kein Bildschirm ausgewählt")).toBeVisible();
	await expect(screen03.locator("img")).toHaveCount(1);
});

test("composite bitmaps render at their true natural size, not shrunk by the browser's default img sizing (regression)", async ({
	page,
}) => {
	// Tailwind's preflight reset applies `img { max-width: 100%; height:
	// auto }` globally, which silently shrinks a composite bitmap down to
	// its single-screen container whenever the composite spans more than
	// one screen — breaking the negative-offset slicing technique this
	// whole preview relies on. It stayed hidden because a flat color still
	// "looks right" even when cropped wrong — this checks the actual root
	// cause (rendered size vs. natural size) directly, for content that
	// does vary spatially, so a regression here can't hide the same way.
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 4/ }).click();
	await page
		.getByRole("button", { name: /Bildschirm 5/ })
		.click({ modifiers: ["Shift"] });
	await page.getByLabel("Text", { exact: true }).fill("HALLO WELT");

	for (const id of ["4", "5"]) {
		const img = page
			.getByRole("button", { name: new RegExp(`Bildschirm ${id}`) })
			.locator("img");
		const sizes = await img.evaluate((el: HTMLImageElement) => ({
			offsetWidth: el.offsetWidth,
			naturalWidth: el.naturalWidth,
		}));
		expect(sizes.naturalWidth).toBeGreaterThan(64); // a genuinely wide composite, not a fluke
		expect(sizes.offsetWidth).toBe(sizes.naturalWidth);
	}
});

test("shift+click adds a large screen; a plain click on either replaces the selection", async ({
	page,
}) => {
	await page.goto("/");

	const screen04 = page.getByRole("button", { name: /Bildschirm 4/ });
	const screen07 = page.getByRole("button", { name: /Bildschirm 7/ });

	await screen04.click();
	await expect(page.getByText("Bildschirm 4 ausgewählt")).toBeVisible();

	await screen07.click({ modifiers: ["Shift"] });
	await expect(page.getByText("Bildschirme 4 und 7 ausgewählt")).toBeVisible();

	// A plain click (no shift) on either replaces the whole selection.
	await screen04.click();
	await expect(page.getByText("Bildschirm 4 ausgewählt")).toBeVisible();
});

test("a large-screen selection splits a solid color across both screens", async ({
	page,
}) => {
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 4/ }).click();
	await page
		.getByRole("button", { name: /Bildschirm 7/ })
		.click({ modifiers: ["Shift"] });
	await expect(page.getByText("Bildschirme 4 und 7 ausgewählt")).toBeVisible();

	await page.getByRole("tab", { name: "Hintergrund" }).click();
	await page.getByLabel("#FE4441").click();

	const screen04 = page.getByRole("button", { name: /Bildschirm 4/ });
	const screen07 = page.getByRole("button", { name: /Bildschirm 7/ });
	await expect(screen04.locator("img")).toHaveCount(1);
	await expect(screen07.locator("img")).toHaveCount(1);

	const [r1, g1, b1] = await samplePixel(screen04.locator("img"));
	const [r2, g2, b2] = await samplePixel(screen07.locator("img"));
	expect([r1, g1, b1]).toEqual([254, 68, 65]);
	expect([r2, g2, b2]).toEqual([254, 68, 65]);
});

test("saving goes through a real network round-trip, not just local state", async ({
	page,
}) => {
	await page.goto("/");

	const screen03 = page.getByRole("button", { name: /Bildschirm 3/ });
	await screen03.click();
	await page.getByRole("tab", { name: "Hintergrund" }).click();
	await page.getByLabel("#B4B9FF").click();

	const applyRequestPromise = page.waitForRequest(
		(req) => req.url().includes("/api/apply") && req.method() === "POST",
	);
	await page.getByRole("button", { name: "Speichern" }).click();
	const applyRequest = await applyRequestPromise;
	const body = applyRequest.postDataJSON();

	await expect(page.getByRole("button", { name: "Speichern" })).toHaveText(
		"Speichern",
	);
	expect(body.selectionKind).toBe("small");
	expect(body.screens).toEqual([
		{
			screenId: "03",
			geometry: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 },
		},
	]);
	expect(body.content.bitmap).toMatch(/^data:image\/png/);

	// Confirm the (mocked) backend actually now has it, via a fresh fetch —
	// not just trusting client-side state.
	const state = await page.evaluate(() =>
		fetch("/api/state").then((r) => r.json()),
	);
	expect(state.screens["03"].content.bitmap).toBe(body.content.bitmap);
});

test("shift+clicking a screen of the other kind adds it to the selection", async ({
	page,
}) => {
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 1/ }).click();
	await expect(page.getByText("Bildschirm 1 ausgewählt")).toBeVisible();

	await page
		.getByRole("button", { name: /Bildschirm 4/ })
		.click({ modifiers: ["Shift"] });
	await expect(page.getByText("Bildschirme 1 und 4 ausgewählt")).toBeVisible();
});

test("the preview never needs to scroll, even in a fairly small window", async ({
	page,
}) => {
	// Narrower/shorter than the original design, but still wide enough for
	// the (currently fixed-width) menu sidebar — a separate concern from
	// what's being tested here, which is the Stage itself never scrolling.
	await page.setViewportSize({ width: 900, height: 600 });
	await page.goto("/");

	const preview = page.locator("section", { has: page.getByText("Vorschau") });
	const scrollable = await preview.evaluate(
		(el) =>
			el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
	);
	expect(scrollable).toBe(false);

	// All 7 screens are still present, just scaled down to fit.
	for (const id of ["1", "2", "3", "4", "5", "6", "7"]) {
		await expect(
			page.getByRole("button", { name: new RegExp(`Bildschirm ${id}`) }),
		).toBeVisible();
	}
});

test("switching tabs never asks to save or discard — each tab keeps its own draft", async ({
	page,
}) => {
	// Text and Hintergrund write independent layers (see domain/types.ts
	// "withEdit"), so an unsaved edit in one survives a trip through the
	// other — no confirmation needed, and nothing gets silently dropped.
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 3/ }).click();
	await page.getByLabel("Text", { exact: true }).fill("HALLO");

	await page.getByRole("tab", { name: "Hintergrund" }).click();
	await expect(
		page.getByRole("alertdialog", { name: "Ungespeicherte Änderungen" }),
	).not.toBeVisible();
	await expect(page.getByRole("tab", { name: "Hintergrund" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await page.getByLabel("#FE4441").click();

	await page.getByRole("tab", { name: "Text", exact: true }).click();
	await expect(page.getByLabel("Text", { exact: true })).toHaveValue("HALLO");

	// Both edits are still there to save together.
	await expect(
		page.getByText("Änderungen noch nicht gespeichert."),
	).toBeVisible();
	const saveButton = page.getByRole("button", { name: "Speichern" });
	await expect(saveButton).toBeEnabled();
});

test("switching from Text to Animation/Bild silently drops the unsaved text draft (they share one foreground layer)", async ({
	page,
}) => {
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 3/ }).click();
	await page.getByLabel("Text", { exact: true }).fill("HALLO");

	await page.getByRole("tab", { name: "Animation/Bild" }).click();
	await expect(
		page.getByRole("alertdialog", { name: "Ungespeicherte Änderungen" }),
	).not.toBeVisible();
	await page.getByRole("button", { name: "Logo" }).click();

	await page.getByRole("tab", { name: "Text", exact: true }).click();
	// The text draft was dropped the moment a template was picked, not saved
	// anywhere to come back to.
	await expect(page.getByLabel("Text", { exact: true })).toHaveValue("");
});

test("selecting a different screen with an unsaved draft still asks whether to save or discard it", async ({
	page,
}) => {
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 3/ }).click();
	await page.getByLabel("Text", { exact: true }).fill("HALLO");

	const screen04 = page.getByRole("button", { name: /Bildschirm 4/ });
	await screen04.click();
	const dialog = page.getByRole("alertdialog", {
		name: "Ungespeicherte Änderungen",
	});
	await expect(dialog).toBeVisible();
	// Switching didn't happen yet — 03 is still selected underneath the dialog.
	await expect(page.getByLabel("Text", { exact: true })).toHaveValue("HALLO");

	// The × button just closes the dialog, keeping the draft and the selection.
	await dialog.getByRole("button", { name: "Schließen" }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.getByText("Bildschirm 3 ausgewählt")).toBeVisible();
	await expect(page.getByLabel("Text", { exact: true })).toHaveValue("HALLO");

	// "Verwerfen" drops the draft and completes the switch.
	await screen04.click();
	await dialog.getByRole("button", { name: "Verwerfen" }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.getByLabel("Text", { exact: true })).toHaveValue("");
});

test("selecting a different screen can save the draft first, then completes the switch", async ({
	page,
}) => {
	await page.goto("/");

	await page.getByRole("button", { name: /Bildschirm 3/ }).click();
	await page.getByLabel("Text", { exact: true }).fill("HALLO");

	await page.getByRole("button", { name: /Bildschirm 4/ }).click();
	const dialog = page.getByRole("alertdialog", {
		name: "Ungespeicherte Änderungen",
	});
	await expect(dialog).toBeVisible();

	const applyRequestPromise = page.waitForRequest(
		(req) => req.url().includes("/api/apply") && req.method() === "POST",
	);
	await dialog.getByRole("button", { name: "Speichern" }).click();
	await applyRequestPromise;

	await expect(dialog).not.toBeVisible();
	await expect(page.getByText("Bildschirm 4 ausgewählt")).toBeVisible();
});
