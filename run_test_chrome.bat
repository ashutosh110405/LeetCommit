@echo off
title Launch LeetCommit Test Chrome
echo ===============================================================
echo   Launching Chrome with LeetCommit Extension Loaded Unpacked
echo ===============================================================
echo.
echo Extension Path: %~dp0
echo.

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

if not exist %CHROME_PATH% (
    echo Error: Chrome not found at %CHROME_PATH%
    pause
    exit /b 1
)

start "" %CHROME_PATH% --load-extension="%~dp0." --user-data-dir="%TEMP%\leetcommit_chrome_profile" "https://leetcode.com/problems/two-sum/" "chrome://extensions"
echo Chrome launched successfully!

