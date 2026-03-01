"""Tests for SPEC-401: Categorised Persona Library.

Covers:
- preset_service.seed_system_presets (idempotency, data integrity)
- preset_service.list_presets (returns all, correct ordering)
- preset_service.create_preset (user preset creation)
- preset_service.delete_preset (success and system-preset protection)
- Router endpoints: GET /agents/presets, POST /agents/presets,
  DELETE /agents/presets/{id} (200, 201, 204, 403, 404)
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from services import preset_service
from schemas.api import CreatePresetRequestSchema


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_preset_data(**overrides) -> CreatePresetRequestSchema:
    defaults = dict(
        display_name="Custom Analyst",
        persona_description="A custom persona for testing",
        expertise="Testing and QA",
        suggested_model="claude-sonnet-4-6",
        llm_provider="anthropic",
        category="general",
    )
    defaults.update(overrides)
    return CreatePresetRequestSchema(**defaults)


# ---------------------------------------------------------------------------
# seed_system_presets
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_seed_is_idempotent(db: AsyncSession):
    """Calling seed twice should not create duplicate rows."""
    await preset_service.seed_system_presets(db)
    first_count = len(await preset_service.list_presets(db))

    await preset_service.seed_system_presets(db)
    second_count = len(await preset_service.list_presets(db))

    assert first_count == second_count
    assert first_count > 0


@pytest.mark.asyncio
async def test_seed_runs_even_when_user_presets_exist(db: AsyncSession):
    """Seed should insert system presets even if user presets already exist."""
    # Create a user preset before any seeding
    user_data = _user_preset_data(display_name="Pre-existing User")
    await preset_service.create_preset(db, user_data)

    # Seed should still run (user preset must not block it)
    await preset_service.seed_system_presets(db)

    all_presets = await preset_service.list_presets(db)
    system_presets = [p for p in all_presets if p.is_system]
    assert len(system_presets) > 0


@pytest.mark.asyncio
async def test_seed_creates_system_presets(db: AsyncSession):
    """All seeded presets should have is_system=True."""
    await preset_service.seed_system_presets(db)
    presets = await preset_service.list_presets(db)

    assert len(presets) > 0
    for preset in presets:
        assert preset.is_system is True


# ---------------------------------------------------------------------------
# list_presets
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_presets_returns_all(db: AsyncSession):
    """list_presets should return all seeded rows."""
    await preset_service.seed_system_presets(db)
    presets = await preset_service.list_presets(db)

    # The seed data defines 31 presets across 6 categories
    assert len(presets) >= 31


@pytest.mark.asyncio
async def test_list_presets_ordering(db: AsyncSession):
    """System presets first, then user presets; each group sorted alpha by display_name."""
    await preset_service.seed_system_presets(db)

    # Add a user preset whose name sorts before system presets alphabetically
    user_preset = await preset_service.create_preset(db, _user_preset_data(display_name="AAA User"))

    presets = await preset_service.list_presets(db)

    # All system presets must come before the user preset
    system_indices = [i for i, p in enumerate(presets) if p.is_system]
    user_indices = [i for i, p in enumerate(presets) if not p.is_system]

    assert len(user_indices) >= 1
    assert len(system_indices) > 0
    # Every system preset appears before every user preset
    assert max(system_indices) < min(user_indices)


# ---------------------------------------------------------------------------
# create_preset
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_user_preset(db: AsyncSession):
    """create_preset should persist a new row with is_system=False."""
    data = _user_preset_data()
    preset = await preset_service.create_preset(db, data)

    assert preset.id is not None
    assert preset.display_name == "Custom Analyst"
    assert preset.persona_description == "A custom persona for testing"
    assert preset.expertise == "Testing and QA"
    assert preset.suggested_model == "claude-sonnet-4-6"
    assert preset.llm_provider == "anthropic"
    assert preset.category == "general"
    assert preset.is_system is False


@pytest.mark.asyncio
async def test_create_user_preset_appears_in_list(db: AsyncSession):
    """A created user preset should be retrievable via list_presets."""
    data = _user_preset_data(display_name="New Tester")
    created = await preset_service.create_preset(db, data)

    presets = await preset_service.list_presets(db)
    ids = [p.id for p in presets]
    assert created.id in ids


# ---------------------------------------------------------------------------
# delete_preset
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_user_preset(db: AsyncSession):
    """delete_preset should remove a user preset and return the deleted record."""
    data = _user_preset_data()
    created = await preset_service.create_preset(db, data)

    deleted = await preset_service.delete_preset(db, created.id)
    assert deleted is not None
    assert deleted.id == created.id

    # Should no longer appear in list
    remaining = await preset_service.list_presets(db)
    assert created.id not in [p.id for p in remaining]


@pytest.mark.asyncio
async def test_delete_preset_returns_none_for_missing(db: AsyncSession):
    """delete_preset should return None when the preset does not exist."""
    result = await preset_service.delete_preset(db, "nonexistent-preset-id")
    assert result is None


@pytest.mark.asyncio
async def test_delete_system_preset_raises(db: AsyncSession):
    """delete_preset should raise ValueError for a system preset."""
    await preset_service.seed_system_presets(db)
    presets = await preset_service.list_presets(db)

    system_preset = next(p for p in presets if p.is_system)

    with pytest.raises(ValueError, match="system preset"):
        await preset_service.delete_preset(db, system_preset.id)


# ---------------------------------------------------------------------------
# Router tests — HTTP layer
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def app_with_db(db: AsyncSession):
    """Return a FastAPI app instance with get_db overridden to use the test DB."""
    from main import app
    from core.database import get_db

    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_router_get_presets(app_with_db, db: AsyncSession):
    """GET /agents/presets should return 200 with a list of presets."""
    await preset_service.seed_system_presets(db)

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.get("/agents/presets")

    assert response.status_code == 200
    body = response.json()
    assert "presets" in body
    assert isinstance(body["presets"], list)
    assert len(body["presets"]) > 0

    # Each preset has the required new fields
    first = body["presets"][0]
    assert "llm_provider" in first
    assert "category" in first
    assert "is_system" in first


@pytest.mark.asyncio
async def test_router_post_preset(app_with_db):
    """POST /agents/presets should create and return a new preset with status 201."""
    payload = {
        "display_name": "Test Persona",
        "persona_description": "A persona created in tests",
        "expertise": "Testing",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    }

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.post("/agents/presets", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["display_name"] == "Test Persona"
    assert body["is_system"] is False
    assert body["llm_provider"] == "anthropic"
    assert body["category"] == "general"
    assert "id" in body


@pytest.mark.asyncio
async def test_router_delete_user_preset(app_with_db):
    """DELETE /agents/presets/{id} should return 204 for a user preset."""
    # First create a preset
    payload = {
        "display_name": "To Be Deleted",
        "persona_description": "Will be deleted",
        "expertise": "Deletion",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "creative",
    }

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        create_resp = await client.post("/agents/presets", json=payload)
        assert create_resp.status_code == 201
        preset_id = create_resp.json()["id"]

        delete_resp = await client.delete(f"/agents/presets/{preset_id}")

    assert delete_resp.status_code == 204


@pytest.mark.asyncio
async def test_router_delete_system_preset_returns_403(app_with_db, db: AsyncSession):
    """DELETE /agents/presets/{id} should return 403 when targeting a system preset."""
    await preset_service.seed_system_presets(db)
    presets = await preset_service.list_presets(db)
    system_preset = next(p for p in presets if p.is_system)

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.delete(f"/agents/presets/{system_preset.id}")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_router_delete_nonexistent_preset_returns_404(app_with_db):
    """DELETE /agents/presets/{id} should return 404 when preset does not exist."""
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.delete("/agents/presets/does-not-exist")

    assert response.status_code == 404
