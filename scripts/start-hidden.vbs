Option Explicit

Dim shell, fso, scriptDir, rootDir, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & rootDir & "\scripts\start-app.ps1"""
shell.Run command, 0, False
