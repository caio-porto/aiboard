"""Database utility helpers ensuring file descriptors and connections are closed upon block exit."""
import sqlite3
import logging

logger = logging.getLogger(__name__)

_real_sqlite_connect = sqlite3.connect

class ClosingConnect:
    """Wrapper em torno de sqlite3.Connection que garante fechamento imediato do descritor de arquivo ao sair do bloco 'with'."""
    def __init__(self, *args, **kwargs):
        if "timeout" not in kwargs and len(args) < 2:
            kwargs["timeout"] = 15.0
        object.__setattr__(self, "conn", _real_sqlite_connect(*args, **kwargs))

    def __enter__(self):
        self.conn.__enter__()
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            return self.conn.__exit__(exc_type, exc_val, exc_tb)
        finally:
            try:
                self.conn.close()
            except Exception:
                pass

    def __getattr__(self, name):
        return getattr(self.conn, name)

    def __setattr__(self, name, value):
        if name == "conn":
            object.__setattr__(self, name, value)
        else:
            setattr(self.conn, name, value)

def patch_sqlite():
    """Instala o wrapper ClosingConnect globalmente no módulo sqlite3."""
    sqlite3.connect = ClosingConnect

# Aplica automaticamente ao importar
patch_sqlite()
