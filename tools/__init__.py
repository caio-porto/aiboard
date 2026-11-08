"""CrewAI Custom Tools for AI Board Enterprise Integrations."""
import os as _os

_custom_tools_dir = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "custom_tools"))
if _os.path.isdir(_custom_tools_dir) and _custom_tools_dir not in __path__:
    __path__.append(_custom_tools_dir)

from tools.telegram_tools import TelegramAlertTool

__all__ = ["TelegramAlertTool"]
