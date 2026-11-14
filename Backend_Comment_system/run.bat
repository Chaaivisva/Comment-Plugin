@echo off
REM Start the Django backend on http://127.0.0.1:8000 (the address the extension uses).
cd /d "%~dp0"

if not exist venv\Scripts\python.exe (
    echo Virtual environment not found. Run setup.bat first.
    pause
    exit /b 1
)

venv\Scripts\python manage.py runserver 127.0.0.1:8000
pause
