Option Explicit

Dim shell, fso, scriptDir, rootDir, command, encodedCommand
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)

If WScript.Arguments.Count > 0 Then
  encodedCommand = WScript.Arguments(0)
  command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand " & encodedCommand
Else
  command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & rootDir & "\scripts\start-app.ps1"""
End If
shell.Run command, 0, False
