"""
GitHub Repository Fetching for User Profiles
"""
import os
import json
import logging
import asyncio
import ssl
import certifi
from typing import Optional, List, Dict, Any, Tuple
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

# SSL context configuration for macOS certificate issues
def create_ssl_context():
    """Create SSL context with proper certificate handling for macOS"""
    context = ssl.create_default_context(cafile=certifi.where())
    return context

def create_connector():
    """Create aiohttp connector with SSL context"""
    return aiohttp.TCPConnector(ssl=create_ssl_context())

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
    
    async def fetch_user_repositories(self, github_username: str, github_token: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Fetch repositories for a given GitHub username
        
        Args:
            github_username: GitHub username to fetch repositories for
            github_token: Optional GitHub token for higher rate limits (fallback to GITHUB_TOKEN env var)
            
        Returns:
            Tuple of (owned_repos, collaborator_repos, other_repos) lists
        """
        timestamp = datetime.now().isoformat()
        logger.info(f"🚀 [{timestamp}] Starting GitHub API fetch for user: {github_username}")
        
        # Always try to use authentication for higher rate limits (5000/hour vs 60/hour)
        if not github_token:
            github_token = os.getenv('GITHUB_TOKEN')
            if github_token:
                logger.info(f"🔑 [{timestamp}] Using fallback GITHUB_TOKEN from environment")
            else:
                logger.warning(f"⚠️ [{timestamp}] No GitHub token provided - using unauthenticated requests (60/hour limit)")
                logger.warning(f"⚠️ [{timestamp}] Consider setting GITHUB_TOKEN environment variable for 5000/hour limit")
        
        logger.info(f"🔑 [{timestamp}] GitHub token: {'PROVIDED' if github_token else 'NOT_PROVIDED'}")
        logger.info(f"📊 [{timestamp}] Rate limit: {'5000/hour (authenticated)' if github_token else '60/hour (unauthenticated)'}")
        
        owned_repositories = []
        collaborator_repositories = []
        other_repositories = []
        
        try:
            headers = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'DeepWiki-Bot/1.0'
            }
            
            if github_token:
                headers['Authorization'] = f'token {github_token}'
                logger.info(f"🔐 [{timestamp}] Added authorization header for 5000/hour rate limit")
            else:
                logger.info(f"🔓 [{timestamp}] Making unauthenticated requests (60/hour rate limit)")
            
            async with aiohttp.ClientSession(connector=create_connector()) as session:
                logger.info(f"📡 [{timestamp}] Starting to fetch owned repositories...")
                await self._fetch_owned_repos(session, github_username, headers, owned_repositories)
                logger.info(f"📊 [{timestamp}] Owned repos fetched: {len(owned_repositories)} repositories")
                
                logger.info(f"📡 [{timestamp}] Starting to fetch contributed repositories...")
                await self._fetch_contributed_repos(session, github_username, headers, collaborator_repositories)
                logger.info(f"📊 [{timestamp}] After contributions: {len(collaborator_repositories)} contributed repositories")
                
                # Fetch collaborator and organization member repositories (always try if we have a token)
                if github_token:  # These endpoints require authentication
                    logger.info(f"📡 [{timestamp}] Starting to fetch collaborator repositories...")
                    await self._fetch_collaborator_repos(session, github_username, headers, collaborator_repositories)
                    logger.info(f"📊 [{timestamp}] Collaborator repos fetched: {len(collaborator_repositories)} repositories")
                    
                    logger.info(f"📡 [{timestamp}] Starting to fetch organization repositories...")
                    await self._fetch_organization_repos(session, github_username, headers, collaborator_repositories)
                    logger.info(f"📊 [{timestamp}] Organization repos fetched: {len(collaborator_repositories)} repositories total")
                    
                    logger.info(f"📡 [{timestamp}] Starting to fetch other repositories (starred, watched)...")
                    await self._fetch_other_repos(session, github_username, headers, other_repositories)
                    logger.info(f"📊 [{timestamp}] Other repos fetched: {len(other_repositories)} repositories")
                else:
                    logger.warning(f"⚠️ [{timestamp}] Skipping collaborator/org/other repos - authentication required")
                    logger.warning(f"⚠️ [{timestamp}] Provide GitHub token to access full repository list and higher rate limits")
            
            # Deduplicate and sort
            logger.info(f"🔄 [{timestamp}] Deduplicating repositories...")
            owned_repositories = self._deduplicate_repos(owned_repositories)
            collaborator_repositories = self._deduplicate_repos(collaborator_repositories)
            other_repositories = self._deduplicate_repos(other_repositories)
            
            logger.info(f"✅ [{timestamp}] Final result: {len(owned_repositories)} owned repos, {len(collaborator_repositories)} collaborator repos for {github_username}")
            
            return owned_repositories, collaborator_repositories, other_repositories
            
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error fetching repositories for {github_username}: {str(e)}")
            logger.error(f"🔍 [{timestamp}] Exception type: {type(e).__name__}")
            return [], [], []
    
    async def _fetch_owned_repos(self, session: aiohttp.ClientSession, username: str, headers: dict, repositories: list):
        """Fetch repositories owned by the user"""
        timestamp = datetime.now().isoformat()
        logger.info(f"👤 [{timestamp}] Fetching owned repositories for {username}")

        # Keep track of base repos we've already added to avoid duplicates
        base_repos_added = set()
        
        try:
            page = 1
            total_fetched = 0
            while len(repositories) < 100:  # Limit total fetched repos
                url = f"https://api.github.com/users/{username}/repos"
                params = {

                    'type': 'owner',
                    'sort': 'updated',
                    'direction': 'desc',
                    'per_page': 30,
                    'page': page
                }
                
                logger.info(f"📡 [{timestamp}] API Call - GET {url} (page {page})")
                
                async with session.get(url, headers=headers, params=params) as response:
                    logger.info(f"📊 [{timestamp}] Response status: {response.status}")
                    
                    if response.status != 200:
                        logger.warning(f"⚠️ [{timestamp}] Failed to fetch owned repos for {username}: {response.status}")
                        if response.status == 403:
                            rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                            rate_limit_reset = response.headers.get('X-RateLimit-Reset')
                            logger.warning(f"🚫 [{timestamp}] Rate limit hit - Remaining: {rate_limit_remaining}, Reset: {rate_limit_reset}")
                        break
                    
                    repos = await response.json()
                    logger.info(f"📦 [{timestamp}] Received {len(repos)} repositories on page {page}")
                    
                    if not repos:
                        logger.info(f"🏁 [{timestamp}] No more repositories on page {page}, stopping")
                        break
                    
                    for repo in repos:

                        # API with type='owner' only returns owned repositories
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
                            'is_collaborator': repo['fork'],  # Mark forks as collaborator repos
                            'is_fork': repo['fork']
                        })
                        total_fetched += 1
                        
                        # If this is a fork, also add the base repository as a collaborator repo
                        if repo['fork'] and 'source' in repo and repo['source']:
                            base_repo_full_name = repo['source']['full_name']
                            
                            # Only add base repo if we haven't already added it
                            if base_repo_full_name not in base_repos_added:
                                base_repos_added.add(base_repo_full_name)
                                
                                logger.info(f"🍴 [{timestamp}] Found fork {repo['full_name']}, adding base repo {base_repo_full_name} as collaborator")
                                
                                repositories.append({
                                    'name': repo['source']['name'],
                                    'full_name': repo['source']['full_name'],
                                    'description': repo['source'].get('description', ''),
                                    'html_url': repo['source']['html_url'],
                                    'language': repo['source'].get('language'),
                                    'stars': repo['source']['stargazers_count'],
                                    'forks': repo['source']['forks_count'],
                                    'updated_at': repo['source']['updated_at'],
                                    'owner': repo['source']['owner']['login'],
                                    'is_owner': False,
                                    'is_collaborator': True,  # Base repo of a fork is considered collaboration
                                    'is_fork': repo['source']['fork'],
                                    'relationship': 'base_of_fork'
                                })
                        elif repo['fork']:
                            # If source info not in basic response, fetch detailed repo info
                            logger.info(f"🍴 [{timestamp}] Found fork {repo['full_name']} without source info, fetching details...")
                            detailed_repo = await self._fetch_repo_details(session, repo['full_name'], headers)
                            
                            if detailed_repo and 'source' in detailed_repo and detailed_repo['source']:
                                base_repo_full_name = detailed_repo['source']['full_name']
                                
                                # Only add base repo if we haven't already added it
                                if base_repo_full_name not in base_repos_added:
                                    base_repos_added.add(base_repo_full_name)
                                    
                                    logger.info(f"🍴 [{timestamp}] Adding base repo {base_repo_full_name} as collaborator from detailed fetch")
                                    
                                    repositories.append({
                                        'name': detailed_repo['source']['name'],
                                        'full_name': detailed_repo['source']['full_name'],
                                        'description': detailed_repo['source'].get('description', ''),
                                        'html_url': detailed_repo['source']['html_url'],
                                        'language': detailed_repo['source'].get('language'),
                                        'stars': detailed_repo['source']['stargazers_count'],
                                        'forks': detailed_repo['source']['forks_count'],
                                        'updated_at': detailed_repo['source']['updated_at'],
                                        'owner': detailed_repo['source']['owner']['login'],
                                        'is_owner': False,
                                        'is_collaborator': True,  # Base repo of a fork is considered collaboration
                                        'is_fork': detailed_repo['source']['fork'],
                                        'relationship': 'base_of_fork'
                                    })
                    
                    logger.info(f"✅ [{timestamp}] Added {len(repos)} repos from page {page}, total so far: {total_fetched}")
                    page += 1
                    
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error fetching owned repos for {username}: {str(e)}")
    
    async def _fetch_contributed_repos(self, session: aiohttp.ClientSession, username: str, headers: dict, repositories: list):
        """Fetch repositories the user has contributed to (via events)"""
        timestamp = datetime.now().isoformat()
        logger.info(f"🤝 [{timestamp}] Fetching contributed repositories for {username}")
        
        try:
            page = 1
            contributed_repos = set()
            
            while len(contributed_repos) < 50 and page <= 3:  # Limit API calls
                url = f"https://api.github.com/users/{username}/events/public"
                params = {
                    'per_page': 30,
                    'page': page
                }
                
                logger.info(f"📡 [{timestamp}] API Call - GET {url} (page {page})")
                
                async with session.get(url, headers=headers, params=params) as response:
                    logger.info(f"📊 [{timestamp}] Events response status: {response.status}")
                    
                    if response.status != 200:
                        logger.warning(f"⚠️ [{timestamp}] Failed to fetch events for {username}: {response.status}")
                        if response.status == 403:
                            rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                            rate_limit_reset = response.headers.get('X-RateLimit-Reset')
                            logger.warning(f"🚫 [{timestamp}] Rate limit hit - Remaining: {rate_limit_remaining}, Reset: {rate_limit_reset}")
                        break
                    
                    events = await response.json()
                    logger.info(f"📅 [{timestamp}] Received {len(events)} events on page {page}")
                    
                    if not events:
                        logger.info(f"🏁 [{timestamp}] No more events on page {page}, stopping")
                        break
                    
                    # Extract repository information from events
                    new_repos_found = 0
                    for event in events:
                        if 'repo' in event and event['type'] in ['PushEvent', 'PullRequestEvent', 'IssuesEvent', 'CreateEvent']:
                            repo_name = event['repo']['name']
                            if repo_name not in contributed_repos:
                                contributed_repos.add(repo_name)
                                
                                logger.info(f"🔍 [{timestamp}] Found new contributed repo: {repo_name}, fetching details...")
                                
                                # Fetch repository details
                                repo_details = await self._fetch_repo_details(session, repo_name, headers)
                                if repo_details:

                                    is_owner = repo_details['owner']['login'] == username
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
                                        'is_owner': is_owner,
                                        'is_collaborator': not is_owner,  # If not owner, then it's a contribution
                                        'is_fork': repo_details['fork'],
                                        'relationship': 'contributor' if not is_owner else 'owner'
                                    })
                                    new_repos_found += 1
                    
                    logger.info(f"✅ [{timestamp}] Found {new_repos_found} new contributed repos on page {page}, total unique: {len(contributed_repos)}")
                    page += 1
                    
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error fetching contributed repos for {username}: {str(e)}")
    
    async def _fetch_repo_details(self, session: aiohttp.ClientSession, repo_full_name: str, headers: dict) -> Optional[dict]:
        """Fetch detailed information about a repository"""
        timestamp = datetime.now().isoformat()
        
        try:
            url = f"https://api.github.com/repos/{repo_full_name}"
            logger.info(f"📡 [{timestamp}] API Call - GET {url}")
            
            async with session.get(url, headers=headers) as response:
                logger.info(f"📊 [{timestamp}] Repo details response status: {response.status}")
                
                if response.status == 200:
                    repo_data = await response.json()
                    logger.info(f"✅ [{timestamp}] Successfully fetched details for {repo_full_name}")
                    return repo_data
                else:
                    logger.warning(f"⚠️ [{timestamp}] Failed to fetch repo details for {repo_full_name}: {response.status}")
                    if response.status == 403:
                        rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                        rate_limit_reset = response.headers.get('X-RateLimit-Reset')
                        logger.warning(f"🚫 [{timestamp}] Rate limit hit - Remaining: {rate_limit_remaining}, Reset: {rate_limit_reset}")
                    return None
                    
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error fetching repo details for {repo_full_name}: {str(e)}")
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
    
    async def _fetch_collaborator_repos(self, session: aiohttp.ClientSession, username: str, headers: dict, repositories: list):
        """Fetch repositories where the user is a collaborator"""
        timestamp = datetime.now().isoformat()
        logger.info(f"🤝 [{timestamp}] Fetching collaborator repositories for {username}")
        
        # Keep track of base repos we've already added to avoid duplicates
        base_repos_added = set()
        
        try:
            page = 1
            total_fetched = 0
            while len(repositories) < 50 and page <= 5:  # Limit to prevent excessive API calls
                url = f"https://api.github.com/user/repos"
                params = {
                    'affiliation': 'collaborator',
                    'sort': 'updated',
                    'direction': 'desc',
                    'per_page': 30,
                    'page': page
                }
                
                logger.info(f"📡 [{timestamp}] API Call - GET {url} (page {page}) - collaborator repos")
                
                async with session.get(url, headers=headers, params=params) as response:
                    logger.info(f"📊 [{timestamp}] Collaborator response status: {response.status}")
                    
                    if response.status != 200:
                        logger.warning(f"⚠️ [{timestamp}] Failed to fetch collaborator repos for {username}: {response.status}")
                        if response.status == 403:
                            rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                            rate_limit_reset = response.headers.get('X-RateLimit-Reset')
                            logger.warning(f"🚫 [{timestamp}] Rate limit hit - Remaining: {rate_limit_remaining}, Reset: {rate_limit_reset}")
                        break
                    
                    repos = await response.json()
                    logger.info(f"📦 [{timestamp}] Received {len(repos)} collaborator repositories on page {page}")
                    
                    if not repos:
                        logger.info(f"🏁 [{timestamp}] No more collaborator repositories on page {page}, stopping")
                        break
                    
                    for repo in repos:
                        is_owner = repo['owner']['login'] == username
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
                            'is_owner': is_owner,
                            'is_collaborator': True,  # All repos in this endpoint are collaborator repos
                            'is_fork': repo['fork'],
                            'relationship': 'collaborator' if not is_owner else 'owner'
                        })
                        total_fetched += 1
                        
                        # If this is a fork, also add the base repository as a collaborator repo
                        if repo['fork']:
                            # Fetch detailed repo info to get source information
                            logger.info(f"🍴 [{timestamp}] Found collaborator fork {repo['full_name']}, fetching details for base repo...")
                            detailed_repo = await self._fetch_repo_details(session, repo['full_name'], headers)
                            
                            if detailed_repo and 'source' in detailed_repo and detailed_repo['source']:
                                base_repo_full_name = detailed_repo['source']['full_name']
                                
                                # Only add base repo if we haven't already added it
                                if base_repo_full_name not in base_repos_added:
                                    base_repos_added.add(base_repo_full_name)
                                    
                                    logger.info(f"🍴 [{timestamp}] Adding base repo {base_repo_full_name} as collaborator from collaborator fork")
                                    
                                    repositories.append({
                                        'name': detailed_repo['source']['name'],
                                        'full_name': detailed_repo['source']['full_name'],
                                        'description': detailed_repo['source'].get('description', ''),
                                        'html_url': detailed_repo['source']['html_url'],
                                        'language': detailed_repo['source'].get('language'),
                                        'stars': detailed_repo['source']['stargazers_count'],
                                        'forks': detailed_repo['source']['forks_count'],
                                        'updated_at': detailed_repo['source']['updated_at'],
                                        'owner': detailed_repo['source']['owner']['login'],
                                        'is_owner': False,
                                        'is_collaborator': True,  # Base repo of a fork is considered collaboration
                                        'is_fork': detailed_repo['source']['fork'],
                                        'relationship': 'base_of_collaborator_fork'
                                    })
                                    
                    logger.info(f"✅ [{timestamp}] Added {len(repos)} collaborator repos from page {page}, total so far: {total_fetched}")
                    page += 1
                    
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error fetching collaborator repos for {username}: {str(e)}")

    async def _fetch_organization_repos(self, session: aiohttp.ClientSession, username: str, headers: dict, repositories: list):
        """Fetch repositories from organizations the user is a member of"""
        timestamp = datetime.now().isoformat()
        logger.info(f"🏢 [{timestamp}] Fetching organization repositories for {username}")
        
        try:
            # First, get user's organizations
            orgs_url = f"https://api.github.com/user/orgs"
            logger.info(f"📡 [{timestamp}] API Call - GET {orgs_url}")
            
            async with session.get(orgs_url, headers=headers) as response:
                if response.status != 200:
                    logger.warning(f"⚠️ [{timestamp}] Failed to fetch organizations for {username}: {response.status}")
                    return
                
                orgs = await response.json()
                logger.info(f"🏢 [{timestamp}] Found {len(orgs)} organizations for {username}")
                
                # Fetch repositories from each organization
                for org in orgs[:10]:  # Limit to first 10 orgs to prevent too many API calls
                    org_login = org['login']
                    logger.info(f"📡 [{timestamp}] Fetching repos from organization: {org_login}")
                    
                    page = 1
                    while len(repositories) < 100 and page <= 3:  # Limit pages per org
                        org_repos_url = f"https://api.github.com/orgs/{org_login}/repos"
                        params = {
                            'sort': 'updated',
                            'direction': 'desc',
                            'per_page': 30,
                            'page': page
                        }
                        
                        async with session.get(org_repos_url, headers=headers, params=params) as org_response:
                            if org_response.status != 200:
                                logger.warning(f"⚠️ [{timestamp}] Failed to fetch repos from org {org_login}: {org_response.status}")
                                break
                            
                            org_repos = await org_response.json()
                            if not org_repos:
                                break
                            
                            for repo in org_repos:
                                # Check if user is a collaborator or has access
                                if repo['owner']['login'] != username:  # Not owner, so it's an org repo
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
                                        'is_owner': False,
                                        'is_collaborator': True,  # Organization member has collaborator access
                                        'is_fork': repo['fork'],
                                        'relationship': 'organization_member'
                                    })
                            
                            logger.info(f"✅ [{timestamp}] Added {len(org_repos)} repos from org {org_login} page {page}")
                            page += 1
                            
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error fetching organization repos for {username}: {str(e)}")
    
    async def _fetch_other_repos(self, session: aiohttp.ClientSession, username: str, headers: dict, repositories: list):
        """Fetch other repositories (starred, watched) the user has interacted with"""
        timestamp = datetime.now().isoformat()
        logger.info(f"⭐ [{timestamp}] Fetching other repositories (starred) for {username}")
        
        try:
            page = 1
            total_fetched = 0
            while len(repositories) < 30 and page <= 3:  # Limit to prevent excessive API calls
                url = f"https://api.github.com/user/starred"
                params = {
                    'sort': 'updated',
                    'direction': 'desc',
                    'per_page': 30,
                    'page': page
                }
                
                logger.info(f"📡 [{timestamp}] API Call - GET {url} (page {page}) - starred repos")
                
                async with session.get(url, headers=headers, params=params) as response:
                    logger.info(f"📊 [{timestamp}] Starred response status: {response.status}")
                    
                    if response.status != 200:
                        logger.warning(f"⚠️ [{timestamp}] Failed to fetch starred repos for {username}: {response.status}")
                        if response.status == 403:
                            rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                            rate_limit_reset = response.headers.get('X-RateLimit-Reset')
                            logger.warning(f"🚫 [{timestamp}] Rate limit hit - Remaining: {rate_limit_remaining}, Reset: {rate_limit_reset}")
                        break
                    
                    repos = await response.json()
                    logger.info(f"📦 [{timestamp}] Received {len(repos)} starred repositories on page {page}")
                    
                    if not repos:
                        logger.info(f"🏁 [{timestamp}] No more starred repositories on page {page}, stopping")
                        break
                    
                    for repo in repos:
                        # Only add if user doesn't own it and isn't a collaborator
                        is_owner = repo['owner']['login'] == username
                        if not is_owner:  # Only add non-owned repositories
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
                                'is_owner': False,
                                'is_collaborator': False,
                                'is_fork': repo['fork'],
                                'relationship': 'starred'
                            })
                            total_fetched += 1
                    
                    logger.info(f"✅ [{timestamp}] Added {len([r for r in repos if r['owner']['login'] != username])} starred repos from page {page}, total so far: {total_fetched}")
                    page += 1
                    
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error fetching starred repos for {username}: {str(e)}")
    
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
        timestamp = datetime.now().isoformat()
        logger.info(f"🆕 [{timestamp}] Starting INITIAL repos update for user {user_id} ({github_username})")
        
        try:
            self._check_supabase_connection()
            
            # Verify the user profile exists before updating
            logger.info(f"🔍 [{timestamp}] Checking if user profile exists...")
            profile_check = self.supabase.table('profiles').select('id').eq('id', user_id).execute()
            if not profile_check.data:
                logger.error(f"❌ [{timestamp}] User profile not found for user_id {user_id}, cannot update repositories")
                return False
            logger.info(f"✅ [{timestamp}] User profile found")
            
            # For initial fetch, don't check rate limiting
            logger.info(f"📡 [{timestamp}] Fetching repositories from GitHub API...")
            owned_repositories, collaborator_repositories, other_repositories = await self.fetch_user_repositories(github_username, github_token)
            logger.info(f"📊 [{timestamp}] Fetched {len(owned_repositories)} owned repos and {len(collaborator_repositories)} collaborator repos from GitHub")
            
            # Update user profile with repositories
            update_data = {
                'github_repos': owned_repositories,
                'github_repos_updated_at': datetime.now().isoformat(),
                'github_collaborator_repos': collaborator_repositories,
                'github_collaborator_repos_updated_at': datetime.now().isoformat(),
                'github_username': github_username
            }
            
            logger.info(f"💾 [{timestamp}] Updating Supabase profile with {len(owned_repositories)} owned and {len(collaborator_repositories)} collaborator repositories...")
            response = self.supabase.table('profiles').update(update_data).eq('id', user_id).execute()
            
            # Check for errors instead of data presence
            if hasattr(response, 'error') and response.error:
                logger.error(f"❌ [{timestamp}] Supabase error updating repositories for user {user_id}: {response.error}")
                return False
            
            # Additional check: ensure the response indicates success
            try:
                logger.info(f"✅ [{timestamp}] Successfully completed initial fetch of {len(owned_repositories)} owned and {len(collaborator_repositories)} collaborator repositories for user {github_username}")
                return True
            except Exception as verify_error:
                logger.warning(f"⚠️ [{timestamp}] Update may have succeeded but verification failed for user {user_id}: {verify_error}")
                return True  # Assume success since the main update didn't error
                
        except Exception as e:
            logger.error(f"💥 [{timestamp}] Error in initial GitHub repos fetch for user {user_id}: {str(e)}")
            logger.error(f"🔍 [{timestamp}] Exception type: {type(e).__name__}")
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
            owned_repositories, collaborator_repositories, other_repositories = await self.fetch_user_repositories(github_username, github_token)
            
            # Update user profile with repositories
            update_data = {
                'github_repos': owned_repositories,
                'github_repos_updated_at': datetime.now().isoformat(),
                'github_collaborator_repos': collaborator_repositories,
                'github_collaborator_repos_updated_at': datetime.now().isoformat(),
                'github_username': github_username
            }
            
            response = self.supabase.table('profiles').update(update_data).eq('id', user_id).execute()
            
            # Check for errors instead of data presence
            if hasattr(response, 'error') and response.error:
                logger.error(f"Supabase error updating repositories for user {user_id}: {response.error}")
                return False
            
            # Additional check: ensure the response indicates success
            try:
                logger.info(f"Successfully updated {len(owned_repositories)} owned and {len(collaborator_repositories)} collaborator repositories for user {github_username}")
                return True
            except Exception as verify_error:
                logger.warning(f"Update may have succeeded but verification failed for user {user_id}: {verify_error}")
                return True  # Assume success since the main update didn't error
                
        except Exception as e:
            logger.error(f"Error updating GitHub repos for user {user_id}: {str(e)}")
            return False
    

    async def get_user_github_repos(self, user_id: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Get GitHub repositories for a user from the database
        
        Args:
            user_id: Supabase user ID
            
        Returns:

            Tuple of (owned_repos, collaborator_repos, other_repos) lists
        """
        try:
            self._check_supabase_connection()
            
            response = self.supabase.table('profiles').select('github_repos, github_collaborator_repos').eq('id', user_id).execute()
            
            if response.data:
                profile_data = response.data[0]
                owned_repos = profile_data.get('github_repos', [])
                collaborator_repos = profile_data.get('github_collaborator_repos', [])
                return owned_repos, collaborator_repos, []
            else:
                return [], [], []
                
        except Exception as e:
            logger.error(f"Error getting GitHub repos for user {user_id}: {str(e)}")
            return [], [], []

# Global instance
github_fetcher = GitHubReposFetcher()

async def update_user_repos_background(user_id: str, github_username: str, github_token: Optional[str] = None):
    """Background task to update user repositories with rate limiting"""
    timestamp = datetime.now().isoformat()
    logger.info(f"⏳ [{timestamp}] Background task STARTED (regular) - user_id: {user_id}, github_username: {github_username}")
    
    try:
        success = await github_fetcher.update_user_github_repos(user_id, github_username, github_token)
        if success:
            logger.info(f"✅ [{timestamp}] Background task COMPLETED successfully for user {user_id}")
        else:
            logger.error(f"❌ [{timestamp}] Background task FAILED for user {user_id}")
    except Exception as e:
        logger.error(f"💥 [{timestamp}] Background task CRASHED for user {user_id}: {str(e)}")

async def update_user_repos_initial_background(user_id: str, github_username: str, github_token: Optional[str] = None):
    """Background task to update repositories for new users (bypasses rate limiting)"""
    timestamp = datetime.now().isoformat()
    logger.info(f"⏳ [{timestamp}] Background task STARTED (initial) - user_id: {user_id}, github_username: {github_username}")
    
    try:
        success = await github_fetcher.update_user_github_repos_initial(user_id, github_username, github_token)
        if success:
            logger.info(f"✅ [{timestamp}] Background task COMPLETED successfully (initial) for user {user_id}")
        else:
            logger.error(f"❌ [{timestamp}] Background task FAILED (initial) for user {user_id}")
    except Exception as e:
        logger.error(f"💥 [{timestamp}] Background task CRASHED (initial) for user {user_id}: {str(e)}") 