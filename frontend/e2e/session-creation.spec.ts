import { test, expect } from '@playwright/test';

// All tests run against the app started with NEXT_PUBLIC_USE_MOCK=true.
// MSW intercepts all API calls so no real backend is needed.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Add a single agent via the agent form. Waits for the form to close. */
async function addAgent(
  page: import('@playwright/test').Page,
  name: string,
  role: string,
): Promise<void> {
  await page.getByLabel('Add a new agent').click();
  await page.waitForSelector('h3:has-text("New Agent")');
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Role/).selectOption(role);
  await page.getByRole('button', { name: 'Add Agent' }).click();
  await page.waitForSelector('h3:has-text("New Agent")', { state: 'detached', timeout: 5000 });
}

/** Navigate to `/sessions/new`, wait for Step 1 to render. */
async function gotoNewSession(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/sessions/new');
  await page.waitForSelector('h2:has-text("Topic & Context")', { timeout: 10000 });
}

/** From Step 1, fill the topic and advance to Step 2. */
async function gotoStep2(page: import('@playwright/test').Page): Promise<void> {
  await gotoNewSession(page);
  await page.getByLabel(/^Topic/).fill('AI Regulation Debate');
  await page.getByLabel('Go to next step: Agent Lineup').click();
  await page.waitForSelector('h2:has-text("Agent Lineup")', { timeout: 10000 });
}

/** From Step 2, add the minimum valid lineup and advance to Step 3. */
async function gotoStep3(page: import('@playwright/test').Page): Promise<void> {
  await gotoStep2(page);
  await page.waitForSelector('[aria-label="Agent presets"]', { timeout: 10000 });

  const agents = [
    { name: 'Aria', role: 'moderator' },
    { name: 'Scribe', role: 'scribe' },
    { name: 'Agent One', role: 'participant' },
    { name: 'Agent Two', role: 'participant' },
  ];
  for (const agent of agents) {
    await addAgent(page, agent.name, agent.role);
  }

  await page.getByLabel('Go to next step: Session Config').click();
  await page.waitForSelector('h2:has-text("Session Config")', { timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Session list page
// ---------------------------------------------------------------------------

test.describe('Session list page', () => {
  test('loads and shows mock sessions with status badges', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    await expect(page.getByText('Should AI systems be regulated by governments?')).toBeVisible();
    await expect(page.getByText('Is universal basic income a viable economic policy?')).toBeVisible();
    await expect(
      page.getByText('Open source vs closed source AI: which approach benefits society more?'),
    ).toBeVisible();
  });

  test('renders a status badge for each session', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    // Use span locators to avoid matching the containing <a> whose aria-label also
    // contains the status word.
    await expect(page.locator('span[aria-label="Status: Running"]')).toBeVisible();
    await expect(page.locator('span[aria-label="Status: Configured"]')).toBeVisible();
    await expect(page.locator('span[aria-label="Status: Ended"]')).toBeVisible();
  });

  test('shows agent count and round info on session cards', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[aria-label="Sessions list"]', { timeout: 10000 });

    // Scope to the first mock session card to avoid strict-mode violations from
    // multiple sessions sharing the same agent count.
    const firstCard = page.getByRole('link', {
      name: /Session: Should AI systems be regulated by governments/,
    });
    await expect(firstCard.getByText('4 agents')).toBeVisible();
    await expect(firstCard.getByText('Round 3 / 10')).toBeVisible();
  });

  test('"New Session" button in header navigates to /sessions/new', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[aria-label="Create a new session"]', { timeout: 10000 });
    await page.click('[aria-label="Create a new session"]');

    await expect(page).toHaveURL('/sessions/new');
  });
});

// ---------------------------------------------------------------------------
// New session wizard – Step 1: Topic & Context
// ---------------------------------------------------------------------------

test.describe('New session wizard – Step 1', () => {
  test.beforeEach(async ({ page }) => {
    await gotoNewSession(page);
  });

  test('renders the topic input and context textarea on step 1', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Topic & Context' })).toBeVisible();
    await expect(page.getByLabel(/^Topic/)).toBeVisible();
    await expect(page.getByLabel(/Supporting Context/)).toBeVisible();
  });

  test('"Next" button is disabled when topic is empty', async ({ page }) => {
    const nextBtn = page.getByLabel('Go to next step: Agent Lineup');
    await expect(nextBtn).toBeDisabled();
  });

  test('filling the topic enables the "Next" button', async ({ page }) => {
    const nextBtn = page.getByLabel('Go to next step: Agent Lineup');
    await page.getByLabel(/^Topic/).fill('Should AI be regulated?');
    await expect(nextBtn).toBeEnabled();
  });

  test('can fill topic and context then advance to step 2', async ({ page }) => {
    await page.getByLabel(/^Topic/).fill('Should AI be regulated?');
    await page.getByLabel(/Supporting Context/).fill('Some background material here.');

    await page.getByLabel('Go to next step: Agent Lineup').click();

    await expect(page.getByRole('heading', { name: 'Agent Lineup' })).toBeVisible();
  });

  test('character count updates as context is typed', async ({ page }) => {
    const textarea = page.getByLabel(/Supporting Context/);
    await textarea.fill('Hello');
    await expect(page.getByText('5 characters')).toBeVisible();
  });

  test('step indicator highlights step 1 as active', async ({ page }) => {
    // The StepIndicator uses aria-current="step" on the active circle
    const activeCircle = page.locator('[aria-current="step"]');
    await expect(activeCircle).toBeVisible();
    await expect(activeCircle).toContainText('1');
  });
});

// ---------------------------------------------------------------------------
// New session wizard – Step 2: Agent Lineup
// ---------------------------------------------------------------------------

test.describe('New session wizard – Step 2', () => {
  test.beforeEach(async ({ page }) => {
    await gotoStep2(page);
  });

  test('renders the agent lineup heading and "Add Agent" button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Agent Lineup' })).toBeVisible();
    await expect(page.getByLabel('Add a new agent')).toBeVisible();
  });

  test('preset panel loads and shows presets from the mock API', async ({ page }) => {
    await page.waitForSelector('[aria-label="Agent presets"]', { timeout: 10000 });

    // MSW handler for GET /agents/presets returns MOCK_PRESETS
    await expect(page.getByLabel('Use preset: The Challenger')).toBeVisible();
    await expect(page.getByLabel('Use preset: The Pragmatist')).toBeVisible();
    await expect(page.getByLabel('Use preset: The Ethicist')).toBeVisible();
  });

  test('clicking "Add Agent" opens the agent form', async ({ page }) => {
    await page.getByLabel('Add a new agent').click();
    await expect(page.getByRole('heading', { name: 'New Agent' })).toBeVisible();
    await expect(page.getByLabel(/^Name/)).toBeVisible();
  });

  test('agent form shows a validation error when submitted without a name', async ({ page }) => {
    await page.getByLabel('Add a new agent').click();
    await page.getByRole('button', { name: 'Add Agent' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
  });

  test('can add a moderator agent and see it in the configured agents list', async ({ page }) => {
    await addAgent(page, 'Aria the Moderator', 'moderator');

    await expect(
      page.getByRole('list', { name: 'Configured agents' }).getByText('Aria the Moderator'),
    ).toBeVisible();
  });

  test('can add a scribe agent and see it in the configured agents list', async ({ page }) => {
    await addAgent(page, 'Silent Scribe', 'scribe');

    await expect(
      page.getByRole('list', { name: 'Configured agents' }).getByText('Silent Scribe'),
    ).toBeVisible();
  });

  test('can remove an agent from the list', async ({ page }) => {
    await addAgent(page, 'Temp Agent', 'participant');
    await expect(
      page.getByRole('list', { name: 'Configured agents' }).getByText('Temp Agent'),
    ).toBeVisible();

    await page.getByLabel('Remove agent Temp Agent').click();
    await expect(page.getByText('Temp Agent')).not.toBeVisible();
  });

  test('shows a validation error when advancing without meeting minimum role requirements', async ({
    page,
  }) => {
    // No agents added – click next
    await page.getByLabel('Go to next step: Session Config').click();
    // The lineup error <p role="alert"> contains the moderator requirement message.
    // Scope away from the Next.js route announcer which also has role="alert".
    await expect(page.locator('p[role="alert"]')).toContainText('moderator');
  });

  test('clicking a preset pre-fills the agent form with preset values', async ({ page }) => {
    await page.waitForSelector('[aria-label="Agent presets"]', { timeout: 10000 });

    await page.getByLabel('Use preset: The Challenger').click();

    // The form opens with the preset's display_name pre-filled
    await expect(page.getByLabel(/^Name/)).toHaveValue('The Challenger');
  });

  test('can add a full valid lineup and advance to step 3', async ({ page }) => {
    await page.waitForSelector('[aria-label="Agent presets"]', { timeout: 10000 });

    const agents = [
      { name: 'Aria', role: 'moderator' },
      { name: 'Scribe', role: 'scribe' },
      { name: 'Agent One', role: 'participant' },
      { name: 'Agent Two', role: 'participant' },
    ];
    for (const agent of agents) {
      await addAgent(page, agent.name, agent.role);
    }

    await page.getByLabel('Go to next step: Session Config').click();
    await expect(page.getByRole('heading', { name: 'Session Config' })).toBeVisible();
  });

  test('"Back" button on step 2 returns to step 1', async ({ page }) => {
    await page.getByLabel('Go back to Topic step').click();
    await expect(page.getByRole('heading', { name: 'Topic & Context' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// New session wizard – Step 3: Session Config
// ---------------------------------------------------------------------------

test.describe('New session wizard – Step 3', () => {
  test.beforeEach(async ({ page }) => {
    await gotoStep3(page);
  });

  test('renders session config fields with default values', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Session Config' })).toBeVisible();
    await expect(page.getByLabel(/Max Rounds/)).toHaveValue('10');
    await expect(page.getByLabel(/Convergence Majority/)).toHaveValue('0.6');
  });

  test('priority weight sliders are present for all three keys', async ({ page }) => {
    await expect(page.getByLabel('Priority weight for recency')).toBeVisible();
    await expect(page.getByLabel('Priority weight for novelty')).toBeVisible();
    await expect(page.getByLabel('Priority weight for role')).toBeVisible();
  });

  test('thought inspector toggle starts unchecked and can be toggled on', async ({ page }) => {
    const toggle = page.getByLabel('Toggle Thought Inspector');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('can change Max Rounds value', async ({ page }) => {
    const maxRoundsInput = page.getByLabel(/Max Rounds/);
    await maxRoundsInput.fill('15');
    await expect(maxRoundsInput).toHaveValue('15');
  });

  test('"Back" button on step 3 returns to step 2', async ({ page }) => {
    await page.getByLabel('Go back to Agent Lineup step').click();
    await expect(page.getByRole('heading', { name: 'Agent Lineup' })).toBeVisible();
  });

  test('"Create Session" button is visible and enabled before submission', async ({ page }) => {
    const submitBtn = page.getByLabel('Create session');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test('submitting the form redirects to the new session detail page', async ({ page }) => {
    await page.getByLabel('Create session').click();

    // MSW POST /sessions returns a session with a dynamically generated id prefixed sess_mock_
    await page.waitForURL(/\/sessions\/sess_mock_/, { timeout: 10000 });

    // The session detail page renders — the GET /sessions/{id} MSW fallback returns a
    // placeholder session because the generated ID is not in the MOCK_SESSIONS fixture.
    // Assert on the placeholder "Live session view" notice that always renders.
    await expect(page.getByText('Live session view')).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Session detail page
// ---------------------------------------------------------------------------

test.describe('Session detail page', () => {
  test('loads session data for an existing mock session', async ({ page }) => {
    await page.goto('/sessions/sess_mock_001');

    await page.waitForSelector('h1', { timeout: 10000 });

    await expect(
      page.getByRole('heading', { name: 'Should AI systems be regulated by governments?' }),
    ).toBeVisible();

    await expect(page.locator('span[aria-label="Status: Running"]')).toBeVisible();
  });

  test('shows the agents roster for a session that has agents', async ({ page }) => {
    await page.goto('/sessions/sess_mock_001');

    await page.waitForSelector('[aria-label="Agent roster"]', { timeout: 10000 });

    // MOCK_AGENTS contains 4 agents for sess_mock_001.
    // Scope to the agent name <p> elements to avoid matching the role badge text.
    const agentNames = page.locator('[aria-label="Agent roster"] p.text-sm.font-medium');
    await expect(agentNames.getByText('Aria')).toBeVisible();
    // "Scribe" appears both as an agent name and as a role badge text.
    // Use the roster list to scope specifically to name elements.
    await expect(agentNames.getByText('Scribe')).toBeVisible();
    await expect(agentNames.getByText('The Challenger')).toBeVisible();
    await expect(agentNames.getByText('The Pragmatist')).toBeVisible();
  });

  test('breadcrumb navigates back to the sessions list', async ({ page }) => {
    await page.goto('/sessions/sess_mock_001');

    await page.waitForSelector('nav[aria-label="Breadcrumb"]', { timeout: 10000 });
    await page.getByLabel('Back to sessions list').click();

    await expect(page).toHaveURL('/');
  });
});
