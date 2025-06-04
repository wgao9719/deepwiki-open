#!/usr/bin/env python3
"""
Test script to verify GitHub repositories functionality
"""
import asyncio
import os
import requests
import json
from datetime import datetime

# Configuration
SERVER_BASE_URL = "http://localhost:8001"

def test_github_repos_endpoints():
    """Test GitHub repositories endpoints"""
    print("=== Testing GitHub Repositories Functionality ===")
    print(f"Server: {SERVER_BASE_URL}")
    print()
    
    # Test 1: Check if server is running
    print("1. Testing server health...")
    try:
        response = requests.get(f"{SERVER_BASE_URL}/health")
        if response.status_code == 200:
            print("✅ Server is running")
        else:
            print(f"❌ Server health check failed: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        return
    
    # Test 2: Check environment variables
    print("\n2. Checking environment configuration...")
    from dotenv import load_dotenv
    load_dotenv()
    
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if supabase_url:
        print(f"✅ SUPABASE_URL configured: {supabase_url[:30]}...")
    else:
        print("❌ NEXT_PUBLIC_SUPABASE_URL not configured")
        
    if supabase_service_key and supabase_service_key != "YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE":
        print("✅ SUPABASE_SERVICE_ROLE_KEY configured")
    else:
        print("❌ SUPABASE_SERVICE_ROLE_KEY not configured properly")
        print("   Please add your actual Supabase service role key to .env file")
        return
    
    # Test 3: Test GitHub repos fetcher initialization
    print("\n3. Testing GitHub repos fetcher...")
    try:
        from api.github_repos import github_fetcher
        if github_fetcher.supabase:
            print("✅ GitHub repos fetcher initialized successfully")
        else:
            print("❌ GitHub repos fetcher failed to initialize")
            return
    except Exception as e:
        print(f"❌ Error initializing GitHub fetcher: {e}")
        return
    
    # Test 4: Test API endpoints
    print("\n4. Testing API endpoints...")
    
    # Test root endpoint
    try:
        response = requests.get(f"{SERVER_BASE_URL}/")
        if response.status_code == 200:
            data = response.json()
            if "GitHub Repositories" in data.get("endpoints", {}):
                print("✅ GitHub Repositories endpoints are documented")
            else:
                print("❌ GitHub Repositories endpoints not found in API docs")
        else:
            print(f"❌ API root endpoint failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error testing API endpoints: {e}")
    
    print("\n=== Test Summary ===")
    print("If all tests pass, the GitHub repositories functionality should work!")
    print("\nTo test with a real user:")
    print("1. Make sure you have the correct SUPABASE_SERVICE_ROLE_KEY in .env")
    print("2. Sign up a new user via GitHub OAuth")
    print("3. Check if their repositories are automatically fetched")
    print("4. Use GET /api/user/github-repos/status/{user_id} to check status")

if __name__ == "__main__":
    test_github_repos_endpoints() 