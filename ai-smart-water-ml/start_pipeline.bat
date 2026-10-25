@echo off
REM Smart Water Monitor — ML Pipeline Launcher
REM Double-click this file OR add it to Windows Task Scheduler to auto-start.

cd /d "%~dp0"
echo Starting Smart Water ML Pipeline...
echo Pipeline will run continuously, polling Atlas every 10 seconds.
echo Press Ctrl+C to stop.
echo.

python src\pipeline\prediction_pipeline.py
pause
