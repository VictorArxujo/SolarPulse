from pydantic import BaseModel, ConfigDict


class ModeloReleCreate(BaseModel):
    nome: str
    fabricante: str = "Pextron"


class ModeloReleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    fabricante: str
