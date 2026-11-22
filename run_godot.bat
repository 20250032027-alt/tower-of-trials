@echo off
setlocal enableextensions enabledelayedexpansion
rem Finds Godot on this PC (it is a portable .exe, so Windows search often misses it) and starts the game.
rem   run_godot.bat        play the game
rem   run_godot.bat edit   open the project in the Godot editor
rem The path it finds is remembered in godot_path.txt. To force one: set GODOT=C:\full\path\Godot.exe
cd /d "%~dp0"
set "MODE="
if /i "%~1"=="edit" set "MODE=--editor"
set "CACHE=%~dp0godot_path.txt"
set "EXE="
if defined GODOT if exist "%GODOT%" set "EXE=%GODOT%"
if not defined EXE if exist "%CACHE%" set /p EXE=<"%CACHE%"
if defined EXE if not exist "!EXE!" set "EXE="
if not defined EXE for %%P in (godot.exe) do set "EXE=%%~$PATH:P"
if not defined EXE (
  echo Looking for Godot. The first time this can take a minute...
  for %%D in ("%USERPROFILE%\Downloads" "%USERPROFILE%\Desktop" "%USERPROFILE%\Documents" "D:\" "E:\" "%LOCALAPPDATA%" "%ProgramFiles%" "C:\") do (
    if not defined EXE if exist "%%~D" (
      for /f "delims=" %%F in ('dir /s /b "%%~D\Godot*.exe" 2^>nul ^| findstr /i /v "console crash"') do if not defined EXE set "EXE=%%F"
    )
  )
)
if not defined EXE (
  echo.
  echo Could not find Godot. Download it from https://godotengine.org/download/windows
  echo ^(unzip it anywhere, no install needed^), then run this file again.
  pause
  exit /b 1
)
>"%CACHE%" echo !EXE!
echo Using !EXE!
"!EXE!" %MODE% --path godot
