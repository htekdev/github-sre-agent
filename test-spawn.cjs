const { spawn } = require('child_process');
const { writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

console.log("Testing copilot spawn with file...");

const prompt = "You are an SRE. Just say 'I am ready to help' and nothing else.";
const tempFile = join(tmpdir(), `sre-test-${Date.now()}.txt`);
writeFileSync(tempFile, prompt, "utf-8");

console.log("Temp file:", tempFile);
console.log("Prompt:", prompt);

const psScript = `
$ErrorActionPreference = 'Stop'
$prompt = Get-Content -Raw -Path '${tempFile.replace(/\\/g, "\\\\")}'
Write-Host "Read prompt: $prompt"
& copilot -p $prompt --allow-all-tools --model claude-sonnet-4 -s
`;

console.log("PS Script:", psScript);

const p = spawn('powershell.exe', [
  '-NoProfile', 
  '-NonInteractive',
  '-Command', 
  psScript
], { 
  stdio: 'inherit' 
});

p.on('close', (code) => {
  console.log('Exit code:', code);
});

p.on('error', (err) => {
  console.error('Error:', err);
});
