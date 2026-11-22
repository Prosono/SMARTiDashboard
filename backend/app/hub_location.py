from pydantic import BaseModel, Field


class HubLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False, strict=True)
    name: str = Field(default="", max_length=80)
