"""Custom & Private Tools Directory for AI Board (`aiboard`).

Place your company-specific, regional, or proprietary CrewAI tools in this package.
All files inside `custom_tools/` (except `__init__.py`, `README.md`, and `example_custom_tool.py`)
are ignored by Git so your private connectors and business logic remain local to your deployment.
"""
import os

_tools_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools"))
if os.path.isdir(_tools_dir) and _tools_dir not in __path__:
    __path__.append(_tools_dir)

