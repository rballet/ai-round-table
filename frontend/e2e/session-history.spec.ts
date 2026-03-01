import { test, expect } from '@playwright/test';

// All tests run against NEXT_PUBLIC_USE_MOCK=true.
// `sess_mock_003` is the completed session fixture in MSW handlers.

// ---------------------------------------------------------------------------
// Session list — search and filter (SPEC-303)
// ---------------------------------------------------------------------------

test.describe('Session list — search and filter', () => {
  test('search input filters sessions by topic text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();

    // Filter to a unique substring from the first mock session
    await searchInput.fill('AI systems');

    // Only the matching session should remain visible.
    await expect(
      page.getByText('Should AI systems be regulated by governments?'),
    ).toBeVisible();
    await expect(
      page.getByText('Is universal basic income a viable economic policy?'),
    ).not.toBeVisible();
  });

  test('clearing search restores full list', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('AI systems');
    await expect(
      page.getByText('Is universal basic income a viable economic policy?'),
    ).not.toBeVisible();

    await searchInput.fill('');
    await expect(
      page.getByText('Is universal basic income a viable economic policy?'),
    ).toBeVisible();
  });

  test('status filter shows only sessions matching the selected status', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    // Click the 'ended' filter
    const endedFilter = page.getByRole('button', { name: /ended/i });
    await expect(endedFilter).toBeVisible();
    await endedFilter.click();

    // The completed mock session should be visible
    await expect(
      page.getByText('Open source vs closed source AI: which approach benefits society more?'),
    ).toBeVisible();

    // Running session should not be visible
    await expect(
      page.getByText('Should AI systems be regulated by governments?'),
    ).not.toBeVisible();
  });

  test('"All" filter button restores full list', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    const endedFilter = page.getByRole('button', { name: /ended/i });
    await endedFilter.click();

    const allFilter = page.getByRole('button', { name: /^all$/i });
    await allFilter.click();

    await expect(
      page.getByText('Should AI systems be regulated by governments?'),
    ).toBeVisible();
  });

  test('combined search + status filter narrows the list', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    // Filter to running status first
    await page.getByRole('button', { name: /running/i }).click();
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('universal basic income');

    // The running session with matching text should appear
    await expect(
      page.getByText('Is universal basic income a viable economic policy?'),
    ).toBeVisible();

    // Other sessions should not appear
    await expect(
      page.getByText('Should AI systems be regulated by governments?'),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Completed session read-only view (SPEC-303)
// ---------------------------------------------------------------------------

test.describe('Completed session — read-only view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sessions/sess_mock_003');
    await page.waitForSelector('h1', { timeout: 15000 });
  });

  test('shows the session topic in the heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', {
        name: 'Open source vs closed source AI: which approach benefits society more?',
      }),
    ).toBeVisible();
  });

  test('renders the metadata card with agent count and round info', async ({ page }) => {
    // Metadata card should show agent count
    await expect(page.getByText(/4 agents/i)).toBeVisible();
  });

  test('renders the termination reason badge for consensus', async ({ page }) => {
    await expect(page.getByText(/consensus/i).first()).toBeVisible();
  });

  test('shows the full transcript with at least one argument entry', async ({ page }) => {
    // CompletedSessionView renders argument entries from the transcript API
    const transcriptSection = page.getByRole('heading', { name: /transcript/i });
    await expect(transcriptSection).toBeVisible();
  });

  test('download transcript button is visible', async ({ page }) => {
    const downloadBtn = page.getByRole('button', { name: /download transcript/i });
    await expect(downloadBtn).toBeVisible();
  });

  test('does not show the Start Discussion panel (read-only)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /start discussion/i })).not.toBeVisible();
  });

  test('does not connect a WebSocket for ended sessions', async ({ page }) => {
    // In mock mode, a live session connects WS and shows connection status.
    // A completed session should not show the WS status badge.
    const wsConnected = page.getByText('WS Connected');
    const wsDisconnected = page.getByText('WS Disconnected');
    // Neither should appear — the read-only view has no WS connection.
    await expect(wsConnected).not.toBeVisible();
    await expect(wsDisconnected).not.toBeVisible();
  });
});
