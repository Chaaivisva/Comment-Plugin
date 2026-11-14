@echo off
REM One-time backend setup for Windows. Double-click or run from cmd/PowerShell.
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (set PY=py) else (set PY=python)

if not exist venv (
    echo Creating virtual environment...
    %PY% -m venv venv
    if errorlevel 1 (
        echo Could not create a virtual environment. Is Python installed and on PATH?
        pause
        exit /b 1
    )
)

echo Installing dependencies...
venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
)

if not exist .env (
    echo Creating .env with a random SECRET_KEY...
    venv\Scripts\python -c "import secrets; t=open('.env.example',encoding='utf-8').read(); open('.env','w',encoding='utf-8').write(t.replace('change-me-to-a-long-random-string', secrets.token_urlsafe(50)))"
)

echo Applying database migrations...
venv\Scripts\python manage.py migrate
if errorlevel 1 (
    echo Migrations failed.
    pause
    exit /b 1
)

echo.
echo Setup complete. Optionally create an admin user with:
echo     venv\Scripts\python manage.py createsuperuser
echo Then start the server with run.bat
pause
