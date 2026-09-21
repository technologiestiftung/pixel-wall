import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("homepage", () => {
	test("no selection: should not have any automatically detectable accessibility issues", async ({
		page,
	}) => {
		await page.goto("/");
		// App bootstrap awaits the mock service worker before rendering — wait
		// for real content so the scan doesn't race an empty #root.
		await page
			.getByRole("heading", { name: "CityLAB Pixel Screens", level: 1 })
			.waitFor();

		const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

		expect(accessibilityScanResults.violations).toEqual([]);
	});

	// The Text/Animation/Farbe editor panels only render once a screen is
	// selected — a scan of the empty state alone would miss issues in them.
	for (const tabName of ["Text", "Animation/Bild", "Hintergrund"]) {
		test(`${tabName} panel: should not have any automatically detectable accessibility issues`, async ({
			page,
		}) => {
			await page.goto("/");
			await page.getByRole("button", { name: /Bildschirm 3/ }).click();
			await page.getByRole("tab", { name: tabName }).click();

			const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

			expect(accessibilityScanResults.violations).toEqual([]);
		});
	}
});
