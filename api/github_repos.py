"""
GitHub Repository Fetching for User Profiles
"""
import os
import json
import logging
import asyncio
from typing import Optional, List, Dict, Any
import aiohttp
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Supabase configuration
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Need service role key for server operations

class GitHubReposFetcher:
    """Handles fetching GitHub repositories for users"""
    
    def __init__(self):
        self.supabase = None
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            try:
                self.supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
                logger.info("GitHub repos fetcher initialized with Supabase connection")
            except Exception as e:
                logger.warning(f"Failed to initialize Supabase client: {e}")
        else:
            logger.warning("Supabase URL or service key not configured - GitHub repos features will be limited")
    
    def _check_supabase_connection(self):
        """Check if Supabase connection is available"""
        if not self.supabase:
            raise ValueError("Supabase connection not available. Please configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")
    
    async def fetch_user_repositories(self, github_username: str, github_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch public repositories that a user has contributed to
        
        Args:
            github_username: GitHub username
            github_token: Optional GitHub token for higher rate limits
            
        Returns:
            List of repository data
        """
        try:
            self._check_supabase_connection()
            
            headers = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'DeepWiki-App'
            }
            
            if github_token:
                headers['Authorization'] = f'Bearer {github_token}'
            
            repositories = []
            
            async with aiohttp.ClientSession() as session:
                # Fetch repositories the user owns
                await self._fetch_owned_repos(session, github_username, headers, repositories)
                
                # Fetch repositories the user has contributed to
                await self._fetch_contributed_repos(session, github_username, headers, repositories)
                
                # Remove duplicates and filter
                unique_repos = self._deduplicate_repos(repositories)
                
                # Limit to most recent 50 repositories to avoid storage bloat
                return unique_repos[:50]
                
        except Exception as e:
            logger.error(f"Error fetching repositories for {github_username}: {str(e)}")
            return []
    
    async def _fetch_owned_repos(self, session: aiohttp.ClientSession, username: str, headers: dict, repositories: list):
        """Fetch repositories owned by the user"""
        try:
            page = 1
            while len(repositories) < 100:  # Limit total fetched repos
                url = f"https://api.github.com/users/{username}/repos"
                params = {
                    'type': 'public',
                    'sort': 'updated',
                    'direction': 'desc',
                    'per_page': 30,
                    'page': page
                }
                
                async with session.get(url, headers=headers, params=params) as response:
                    if response.status != 200:
                        logger.warning(f"Failed to fetch owned repos for {username}: {response.status}")
                        break
                    
                    repos = await response.json()
                    if not repos:
                        break
                    
                    for repo in repos:
                        repositories.append({
                            'name': repo['name'],
                            'full_name': repo['full_name'],
                            'description': repo.get('description', ''),
                            'html_url': repo['html_url'],
                            'language': repo.get('language'),
                            'stars': repo['stargazers_count'],
                            'forks': repo['forks_count'],
                            'updated_at': repo['updated_at'],
                            'owner': repo['owner']['login'],
                            'is_owner': True,
                            'is_fork': repo['fork']
                        })
                    
                    page += 1
                    
        except Exception as e:
            logger.error(f"Error fetching owned repos for {username}: {str(e)}")
    
    async def _fetch_contributed_repos(self, session: aiohttp.ClientSession, username: str, headers: dict, repositories: list):
        """Fetch repositories the user has contributed to (via events)"""
        try:
            page = 1
            contributed_repos = set()
            
            while len(contributed_repos) < 50 and page <= 3:  # Limit API calls
                url = f"https://api.github.com/users/{username}/events/public"
                params = {
                    'per_page': 30,
                    'page': page
                }
                
                async with session.get(url, headers=headers, params=params) as response:
                    if response.status != 200:
                        logger.warning(f"Failed to fetch events for {username}: {response.status}")
                        break
                    
                    events = await response.json()
                    if not events:
                        break
                    
                    # Extract repository information from events
                    for event in events:
                        if 'repo' in event and event['type'] in ['PushEvent', 'PullRequestEvent', 'IssuesEvent', 'CreateEvent']:
                            repo_name = event['repo']['name']
                            if repo_name not in contributed_repos:
                                contributed_repos.add(repo_name)
                                
                                # Fetch repository details
                                repo_details = await self._fetch_repo_details(session, repo_name, headers)
                                if repo_details:
                                    repositories.append({
                                        'name': repo_details['name'],
                                        'full_name': repo_details['full_name'],
                                        'description': repo_details.get('description', ''),
                                        'html_url': repo_details['html_url'],
                                        'language': repo_details.get('language'),
                                        'stars': repo_details['stargazers_count'],
                                        'forks': repo_details['forks_count'],
                                        'updated_at': repo_details['updated_at'],
                                        'owner': repo_details['owner']['login'],
                                        'is_owner': repo_details['owner']['login'] == username,
                                        'is_fork': repo_details['fork']
                                    })
                    
                    page += 1
                    
        except Exception as e:
            logger.error(f"Error fetching contributed repos for {username}: {str(e)}")
    
    async def _fetch_repo_details(self, session: aiohttp.ClientSession, repo_full_name: str, headers: dict) -> Optional[dict]:
        """Fetch detailed information about a repository"""
        try:
            url = f"https://api.github.com/repos/{repo_full_name}"
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.warning(f"Failed to fetch repo details for {repo_full_name}: {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error fetching repo details for {repo_full_name}: {str(e)}")
            return None
    
    def _deduplicate_repos(self, repositories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate repositories and sort by relevance"""
        seen = set()
        unique_repos = []
        
        # Sort by stars and recency
        repositories.sort(key=lambda x: (x['stars'], x['updated_at']), reverse=True)
        
        for repo in repositories:
            repo_key = repo['full_name']
            if repo_key not in seen:
                seen.add(repo_key)
                unique_repos.append(repo)
        
        return unique_repos
    
    async def update_user_github_repos_initial(self, user_id: str, github_username: str, github_token: Optional[str] = None) -> bool:
        """
        Update GitHub repositories for a new user (bypasses rate limiting)
        
        Args:
            user_id: Supabase user ID
            github_username: GitHub username
            github_token: Optional GitHub token
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self._check_supabase_connection()
            
            # Verify the user profile exists before updating
            profile_check = self.supabase.table('profiles').select('id').eq('id', user_id).execute()
            if not profile_check.data:
                logger.error(f"User profile not found for user_id {user_id}, cannot update repositories")
                return False
            
            # For initial fetch, don't check rate limiting
            logger.info(f"Initial fetch of GitHub repositories for new user {github_username}")
            repositories = await self.fetch_user_repositories(github_username, github_token)
            
            # Update user profile with repositories
            update_data = {
                'github_repos': repositories,
                'github_repos_updated_at': datetime.now().isoformat(),
                'github_username': github_username
            }
            
            response = self.supabase.table('profiles').update(update_data).eq('id', user_id).execute()
            
            # Check for errors instead of data presence
            if hasattr(response, 'error') and response.error:
                logger.error(f"Supabase error updating repositories for user {user_id}: {response.error}")
                return False
            
            # Additional check: ensure the response indicates success
            try:
                logger.info(f"Successfully completed initial fetch of {len(repositories)} repositories for user {github_username}")
                
                # Optional: Verify the update was applied by reading back the data
                verify_response = self.supabase.table('profiles').select('github_repos').eq('id', user_id).execute()
                if verify_response.data and verify_response.data[0].get('github_repos') is not None:
                    actual_repo_count = len(verify_response.data[0].get('github_repos', []))
                    logger.info(f"Verification: User {user_id} now has {actual_repo_count} repositories stored")
                
                return True
            except Exception as verify_error:
                logger.warning(f"Update may have succeeded but verification failed for user {user_id}: {verify_error}")
                return True  # Assume success since the main update didn't error
                
        except Exception as e:
            logger.error(f"Error in initial GitHub repos fetch for user {user_id}: {str(e)}")
            return False
    
    async def update_user_github_repos(self, user_id: str, github_username: str, github_token: Optional[str] = None) -> bool:
        """
        Update GitHub repositories for a specific user in the database
        
        Args:
            user_id: Supabase user ID
            github_username: GitHub username
            github_token: Optional GitHub token
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self._check_supabase_connection()
            
            # Check if we should update (only update once per day)
            profile_response = self.supabase.table('profiles').select('github_repos_updated_at').eq('id', user_id).execute()
            
            if profile_response.data:
                last_updated = profile_response.data[0].get('github_repos_updated_at')
                if last_updated:
                    last_updated_dt = datetime.fromisoformat(last_updated.replace('Z', '+00:00'))
                    if datetime.now().timestamp() - last_updated_dt.timestamp() < 24 * 3600:  # Less than 24 hours
                        logger.info(f"GitHub repos for user {user_id} updated recently, skipping")
                        return True
            
            # Fetch repositories
            logger.info(f"Fetching GitHub repositories for user {github_username}")
            repositories = await self.fetch_user_repositories(github_username, github_token)
            
            # Update user profile with repositories
            update_data = {
                'github_repos': repositories,
                'github_repos_updated_at': datetime.now().isoformat(),
                'github_username': github_username
            }
            
            response = self.supabase.table('profiles').update(update_data).eq('id', user_id).execute()
            
            # Check for errors instead of data presence
            if hasattr(response, 'error') and response.error:
                logger.error(f"Supabase error updating repositories for user {user_id}: {response.error}")
                return False
            
            # Additional check: ensure the response indicates success
            try:
                logger.info(f"Successfully updated {len(repositories)} repositories for user {github_username}")
                
                # Optional: Verify the update was applied by reading back the data
                verify_response = self.supabase.table('profiles').select('github_repos').eq('id', user_id).execute()
                if verify_response.data and verify_response.data[0].get('github_repos') is not None:
                    actual_repo_count = len(verify_response.data[0].get('github_repos', []))
                    logger.info(f"Verification: User {user_id} now has {actual_repo_count} repositories stored")
                
                return True
            except Exception as verify_error:
                logger.warning(f"Update may have succeeded but verification failed for user {user_id}: {verify_error}")
                return True  # Assume success since the main update didn't error
                
        except Exception as e:
            logger.error(f"Error updating GitHub repos for user {user_id}: {str(e)}")
            return False
    
    async def get_user_github_repos(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get GitHub repositories for a user from the database
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            List of repository data
        """
        try:
            self._check_supabase_connection()
            
            response = self.supabase.table('profiles').select('github_repos').eq('id', user_id).execute()
            
            if response.data and response.data[0].get('github_repos'):
                return response.data[0]['github_repos']
            else:
                return []
                
        except Exception as e:
            logger.error(f"Error getting GitHub repos for user {user_id}: {str(e)}")
            return []

# Global instance
github_fetcher = GitHubReposFetcher()

async def update_user_repos_background(user_id: str, github_username: str, github_token: Optional[str] = None):
    """Background task to update user repositories"""
    try:
        await github_fetcher.update_user_github_repos(user_id, github_username, github_token)
    except Exception as e:
        logger.error(f"Background task error for user {user_id}: {str(e)}")

async def update_user_repos_initial_background(user_id: str, github_username: str, github_token: Optional[str] = None):
    """Background task to update user repositories for new users (bypasses rate limiting)"""
    try:
        await github_fetcher.update_user_github_repos_initial(user_id, github_username, github_token)
    except Exception as e:
        logger.error(f"Initial background task error for user {user_id}: {str(e)}") 