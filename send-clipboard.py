#!/usr/bin/env python3
"""
Script to send clipboard content to the banking API
Usage: python send-clipboard.py [API_URL]
"""

import sys
import requests
import subprocess
import platform

def get_clipboard_content():
    """Get clipboard content based on the operating system"""
    system = platform.system()
    
    try:
        if system == "Linux":
            # Try xclip first, then xsel
            try:
                return subprocess.check_output(['xclip', '-selection', 'clipboard', '-o'], text=True)
            except (subprocess.CalledProcessError, FileNotFoundError):
                return subprocess.check_output(['xsel', '--clipboard', '--output'], text=True)
        elif system == "Darwin":  # macOS
            return subprocess.check_output(['pbpaste'], text=True)
        elif system == "Windows":
            return subprocess.check_output(['powershell', 'Get-Clipboard'], text=True).replace('\r\n', '\n')
        else:
            raise Exception(f"Unsupported operating system: {system}")
    except Exception as e:
        raise Exception(f"Failed to get clipboard content: {e}")

def send_to_api(data, api_url):
    """Send data to the banking API"""
    try:
        response = requests.post(
            api_url,
            data=data,
            headers={'Content-Type': 'text/plain'},
            timeout=10
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise Exception(f"API request failed: {e}")

def main():
    # Get API URL from command line or use default
    api_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001/update-balances"
    
    print(f"Sending clipboard content to {api_url}...")
    
    try:
        # Get clipboard content
        clipboard_data = get_clipboard_content()
        
        if not clipboard_data.strip():
            print("❌ Error: Clipboard is empty")
            sys.exit(1)
        
        print(f"Clipboard content length: {len(clipboard_data)} characters")
        print(f"First 100 characters: {clipboard_data[:100]}...")
        
        # Send to API
        response = send_to_api(clipboard_data, api_url)
        
        print("✅ Successfully sent data to API")
        print(f"Response: {response}")
        
        if response.get('success'):
            summary = response.get('summary', {})
            print(f"📊 Parsed {summary.get('accountCount', 0)} accounts")
            print(f"💰 Total balance: ${summary.get('totalBalance', 0):.2f}")
            print(f"🎁 Total rewards: ${summary.get('totalRewards', 0):.2f}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 