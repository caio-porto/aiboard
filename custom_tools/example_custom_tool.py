"""Example Custom Tool for AI Board (`aiboard`).

Copy this template to create your own proprietary or regional integrations
(e.g., internal ERPs, custom databases, legacy REST/SOAP APIs, or Playwright automations)
inside `custom_tools/`.
"""
import os
from typing import Type, Optional
from pydantic import BaseModel, Field

try:
    from crewai.tools import BaseTool
except ImportError:
    class BaseTool:
        def __init__(self, **kwargs):
            pass

        def run(self, **kwargs):
            return self._run(**kwargs)


class ExampleCustomToolInput(BaseModel):
    query: str = Field(..., description="Search query or parameter to send to the internal service.")
    limit: Optional[int] = Field(10, description="Maximum number of records to return.")


class ExampleCustomTool(BaseTool):
    name: str = "example_custom_service"
    description: str = (
        "Example custom tool template that queries an internal company API or database. "
        "Use this as a starting point for building private tools in `custom_tools/`."
    )
    args_schema: Type[BaseModel] = ExampleCustomToolInput

    def _run(self, query: str, limit: int = 10) -> str:
        api_url = os.getenv("CUSTOM_SERVICE_URL", "https://api.example.com")
        return (
            f"[ExampleCustomTool] Executed query='{query}' (limit={limit}) against {api_url}."
        )
