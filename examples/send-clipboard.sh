#!/bin/bash

# Script to send clipboard content to the banking API
# Usage: ./send-clipboard.sh [API_URL]

API_URL=${1:-"http://localhost:3001/update-balances"}

echo "Sending clipboard content to $API_URL..."

# Get clipboard content and send to API
if command -v xclip &> /dev/null; then
    # Linux with xclip
    CLIPBOARD_DATA=$(xclip -selection clipboard -o)
elif command -v pbpaste &> /dev/null; then
    # macOS
    CLIPBOARD_DATA=$(pbpaste)
elif command -v powershell.exe &> /dev/null; then
    # WSL/Windows
    CLIPBOARD_DATA=$(powershell.exe Get-Clipboard | tr -d '\r')
else
    echo "Error: No clipboard utility found (xclip, pbpaste, or powershell)"
    exit 1
fi

if [ -z "$CLIPBOARD_DATA" ]; then
    echo "Error: Clipboard is empty"
    exit 1
fi

echo "Clipboard content length: ${#CLIPBOARD_DATA} characters"
echo "First 100 characters: ${CLIPBOARD_DATA:0:100}..."

# Send to API
RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: text/plain" \
    --data-binary "$CLIPBOARD_DATA")

if [ $? -eq 0 ]; then
    echo "✅ Successfully sent data to API"
    echo "Response: $RESPONSE"
else
    echo "❌ Failed to send data to API"
    exit 1
fi 