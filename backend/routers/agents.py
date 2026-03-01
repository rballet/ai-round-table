from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from schemas.agent import AgentPresetSchema
from schemas.api import CreatePresetRequestSchema, PresetsResponseSchema
from services import preset_service

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/presets", response_model=PresetsResponseSchema)
async def get_presets(
    db: AsyncSession = Depends(get_db),
) -> PresetsResponseSchema:
    presets = await preset_service.list_presets(db)
    return PresetsResponseSchema(
        presets=[AgentPresetSchema.model_validate(p) for p in presets]
    )


@router.post("/presets", response_model=AgentPresetSchema, status_code=201)
async def create_preset(
    data: CreatePresetRequestSchema,
    db: AsyncSession = Depends(get_db),
) -> AgentPresetSchema:
    preset = await preset_service.create_preset(db, data)
    return AgentPresetSchema.model_validate(preset.__dict__)


@router.delete("/presets/{preset_id}", status_code=204)
async def delete_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        deleted = await preset_service.delete_preset(db, preset_id)
    except ValueError:
        raise HTTPException(status_code=403, detail="Cannot delete a system preset")

    if deleted is None:
        raise HTTPException(status_code=404, detail="Preset not found")

    return Response(status_code=204)
