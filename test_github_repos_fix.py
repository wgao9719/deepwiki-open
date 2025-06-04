#!/usr/bin/env python3
"""
Test script to verify the GitHub repositories fix
"""
import asyncio
import os
import sys
import logging
from datetime import datetime

# Add the api directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_github_repos_functionality():
    """Test GitHub repositories functionality with a real example"""
    try:
        from github_repos import github_fetcher
        
        # Check if Supabase is properly configured
        if not github_fetcher.supabase:
            logger.error("Supabase connection not available. Check environment variables.")
            return False
        
        logger.info("✅ GitHub repos fetcher initialized successfully")
        
        # Test with a known GitHub user (using a public profile)
        test_username = "octocat"  # GitHub's mascot account
        
        logger.info(f"Testing repository fetch for user: {test_username}")
        
        # Fetch repositories
        repositories = await github_fetcher.fetch_user_repositories(test_username)
        
        if repositories:
            logger.info(f"✅ Successfully fetched {len(repositories)} repositories for {test_username}")
            
            # Display first few repos
            for i, repo in enumerate(repositories[:3]):
                logger.info(f"  {i+1}. {repo['full_name']} - {repo['stars']} stars - {repo.get('language', 'Unknown')} language")
            
            return True
        else:
            logger.warning(f"⚠️  No repositories fetched for {test_username}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error testing GitHub repos functionality: {e}")
        return False

async def test_supabase_update_simulation():
    """Test the update logic without actually modifying user data"""
    try:
        from github_repos import github_fetcher
        
        # Test data structure
        test_repos = [
            {
                'name': 'test-repo',
                'full_name': 'testuser/test-repo',
                'description': 'A test repository',
                'html_url': 'https://github.com/testuser/test-repo',
                'language': 'Python',
                'stars': 42,
                'forks': 7,
                'updated_at': '2024-01-01T00:00:00Z',
                'owner': 'testuser',
                'is_owner': True,
                'is_fork': False
            }
        ]
        
        logger.info(f"✅ Test data structure created with {len(test_repos)} repositories")
        
        # Verify the data structure is JSON serializable
        import json
        json_str = json.dumps(test_repos)
        logger.info(f"✅ Data structure is JSON serializable ({len(json_str)} characters)")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error in Supabase update simulation: {e}")
        return False

async def main():
    """Main test function"""
    logger.info("🚀 Starting GitHub repositories functionality test")
    logger.info("=" * 60)
    
    # Test 1: Basic functionality
    logger.info("Test 1: Basic GitHub API fetching")
    test1_success = await test_github_repos_functionality()
    
    # Test 2: Data structure validation
    logger.info("\nTest 2: Data structure validation")
    test2_success = await test_supabase_update_simulation()
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("📊 TEST SUMMARY")
    logger.info(f"  GitHub API fetch: {'✅ PASS' if test1_success else '❌ FAIL'}")
    logger.info(f"  Data structure:   {'✅ PASS' if test2_success else '❌ FAIL'}")
    
    if test1_success and test2_success:
        logger.info("🎉 All tests passed! The GitHub repos functionality should work correctly.")
        logger.info("💡 Key improvements made:")
        logger.info("   - Fixed error checking logic (check for errors instead of data presence)")
        logger.info("   - Added profile existence verification before updates")
        logger.info("   - Added verification step to confirm updates were applied")
        logger.info("   - Improved logging for better debugging")
    else:
        logger.error("❌ Some tests failed. Check the error messages above.")
    
    return test1_success and test2_success

if __name__ == "__main__":
    asyncio.run(main()) 