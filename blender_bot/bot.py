"""Точка входа для обратной совместимости (deployment/systemd всё ещё
запускают `python bot.py`). Реальная сборка приложения — в app/main.py.
"""

from app.main import main

if __name__ == "__main__":
    main()
