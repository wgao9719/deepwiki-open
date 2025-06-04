#!/usr/bin/env python3
"""
Debug script to test the GitHub repos authentication pipeline
"""
import os
import sys
import asyncio
import logging
from dotenv import load_dotenv

# Add the api directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_pipeline():
    """Test the complete GitHub repos pipeline"""
    
    print("🔍 DEBUGGING GITHUB REPOS PIPELINE")
    print("=" * 50)
    
    # 1. Test environment variables
    print("1. Testing Environment Variables:")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    print(f"   SUPABASE_URL: {'✅ SET' if supabase_url else '❌ MISSING'}")
    print(f"   SERVICE_KEY: {'✅ SET' if supabase_service_key else '❌ MISSING'}")
    
    if supabase_service_key:
        print(f"   SERVICE_KEY length: {len(supabase_service_key)} chars")
        print(f"   SERVICE_KEY starts with: {supabase_service_key[:20]}...")
        print(f"   SERVICE_KEY ends with: ...{supabase_service_key[-20:]}")
    
    # 2. Test Supabase connection
    print("\n2. Testing Supabase Connection:")
    try:
        from github_repos import github_fetcher
        print(f"   GitHub fetcher initialized: {'✅ YES' if github_fetcher.supabase else '❌ NO'}")
        
        if github_fetcher.supabase:
            # Test basic connection
            test_response = github_fetcher.supabase.table('profiles').select('id').limit(1).execute()
            print(f"   Database connection: {'✅ SUCCESS' if test_response else '❌ FAILED'}")
        
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    # 3. Test GitHub API
    print("\n3. Testing GitHub API:")
    try:
        repositories = await github_fetcher.fetch_user_repositories("octocat")
        print(f"   GitHub API fetch: {'✅ SUCCESS' if repositories else '❌ FAILED'}")
        print(f"   Repos fetched: {len(repositories) if repositories else 0}")
        
        if repositories:
            print(f"   Sample repo: {repositories[0]['full_name']}")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    # 4. Test specific user lookup (if you provide a user ID)
    test_user_id = input("\n4. Enter a user ID to test (or press Enter to skip): ").strip()
    if test_user_id:
        print(f"\nTesting with user ID: {test_user_id}")
        try:
            # Check if profile exists
            profile_response = github_fetcher.supabase.table('profiles').select('*').eq('id', test_user_id).execute()
            
            if profile_response.data:
                profile = profile_response.data[0]
                print(f"   Profile found: ✅ YES")
                print(f"   GitHub username: {profile.get('github_username', 'NOT SET')}")
                print(f"   Repos count: {len(profile.get('github_repos', []))}")
                print(f"   Last updated: {profile.get('github_repos_updated_at', 'NEVER')}")
                
                # Test update function
                github_username = profile.get('github_username')
                if github_username:
                    print(f"\n   Testing update for {github_username}...")
                    success = await github_fetcher.update_user_github_repos_initial(test_user_id, github_username)
                    print(f"   Update result: {'✅ SUCCESS' if success else '❌ FAILED'}")
                else:
                    print("   ❌ No GitHub username found in profile")
            else:
                print(f"   Profile found: ❌ NO")
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
    
    # 5. Test backend API endpoint
    print("\n5. Testing Backend API:")
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            # Test health endpoint
            async with session.get("http://localhost:8001/health") as response:
                if response.status == 200:
                    print("   Backend health: ✅ HEALTHY")
                else:
                    print(f"   Backend health: ❌ STATUS {response.status}")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    print("\n" + "=" * 50)
    print("🏁 PIPELINE TEST COMPLETE")

if __name__ == "__main__":
    asyncio.run(test_pipeline())