#!/usr/bin/env python3
"""
Test script to demonstrate the enhanced logging functionality
for the GitHub repos authentication pipeline.
"""

import requests
import json
import time

def test_github_repos_endpoint():
    """Test the GitHub repos endpoint with comprehensive logging"""
    
    # Test user credentials (replace with actual test user)
    USER_ID = "76fc45d7-f58d-4d00-b24f-6731e6186bb3"
    GITHUB_USERNAME = "wgao9719"
    
    print("🧪 Testing GitHub Repos API with Enhanced Logging")
    print("=" * 60)
    
    # Test 1: Direct Backend API Call
    print("\n1. Testing Direct Backend API Call...")
    backend_url = f"http://localhost:8001/api/user/github-repos/update"
    params = {
        "user_id": USER_ID,
        "github_username": GITHUB_USERNAME
    }
    
    try:
        print(f"📡 Calling: {backend_url}")
        print(f"📝 Parameters: {params}")
        
        response = requests.post(backend_url, params=params)
        print(f"📊 Response Status: {response.status_code}")
        print(f"📄 Response Body: {response.text}")
        
        if response.status_code == 200:
            print("✅ Backend API call successful!")
        else:
            print("❌ Backend API call failed!")
            
    except Exception as e:
        print(f"💥 Error calling backend API: {e}")
    
    # Test 2: Next.js Proxy API Call
    print("\n2. Testing Next.js Proxy API Call...")
    proxy_url = f"http://localhost:3000/api/user/github-repos/update"
    proxy_params = {
        "user_id": USER_ID,
        "github_username": GITHUB_USERNAME
    }
    
    try:
        print(f"📡 Calling: {proxy_url}")
        print(f"📝 Parameters: {proxy_params}")
        
        response = requests.post(proxy_url, params=proxy_params)
        print(f"📊 Response Status: {response.status_code}")
        print(f"📄 Response Body: {response.text}")
        
        if response.status_code == 200:
            print("✅ Proxy API call successful!")
        else:
            print("❌ Proxy API call failed!")
            
    except Exception as e:
        print(f"💥 Error calling proxy API: {e}")
    
    print("\n" + "=" * 60)
    print("🔍 Check the terminal outputs for:")
    print("   - Next.js server logs (port 3000)")
    print("   - FastAPI server logs (port 8001)")
    print("   - Detailed GitHub API call logs")
    print("   - Database update logs")
    print("=" * 60)

if __name__ == "__main__":
    test_github_repos_endpoint() 