"""
Supabase Storage Helper Functions for Wiki Cache
"""
import os
import json
import logging
from typing import Optional, List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Supabase configuration
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
STORAGE_BUCKET = "wiki-cache"

class SupabaseStorageError(Exception):
    """Custom exception for Supabase storage operations"""
    pass

def get_supabase_client() -> Client:
    """Get Supabase client instance"""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise SupabaseStorageError("Supabase URL or anonymous key not configured")
    
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

def get_storage_path(owner: str, repo: str, repo_type: str, language: str) -> str:
    """Generate storage path for wiki cache file"""
    filename = f"deepwiki_cache_{repo_type}_{owner}_{repo}_{language}.json"
    return f"deepwiki/{filename}"

def get_local_cache_path(owner: str, repo: str, repo_type: str, language: str) -> str:
    """Generate local file path for wiki cache file"""
    from adalflow.utils import get_adalflow_default_root_path
    cache_dir = os.path.join(get_adalflow_default_root_path(), "wikicache")
    os.makedirs(cache_dir, exist_ok=True)
    filename = f"deepwiki_cache_{repo_type}_{owner}_{repo}_{language}.json"
    return os.path.join(cache_dir, filename)

async def upload_wiki_cache_to_supabase(
    owner: str, 
    repo: str, 
    repo_type: str, 
    language: str, 
    cache_data: Dict[str, Any]
) -> bool:
    """
    Upload wiki cache data to Supabase storage
    
    Args:
        owner: Repository owner
        repo: Repository name
        repo_type: Repository type (e.g., 'github', 'gitlab')
        language: Language code
        cache_data: Wiki cache data dictionary
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        supabase = get_supabase_client()
        storage_path = get_storage_path(owner, repo, repo_type, language)
        
        # Convert cache data to JSON string
        json_content = json.dumps(cache_data, indent=2, ensure_ascii=False)
        json_bytes = json_content.encode('utf-8')
        
        logger.info(f"Uploading wiki cache to Supabase: {storage_path}")
        
        # Upload to Supabase storage
        response = supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=json_bytes,
            file_options={
                "content-type": "application/json",
                "upsert": "true"  # Convert to string
            }
        )
        
        # Check if upload was successful
        if hasattr(response, 'error') and response.error:
            logger.error(f"Error uploading to Supabase storage: {response.error}")
            return False
        elif hasattr(response, 'data') and response.data is None:
            logger.error(f"Upload failed - no data returned from Supabase")
            return False
            
        logger.info(f"Successfully uploaded wiki cache to Supabase: {storage_path}")
        return True
        
    except Exception as e:
        logger.error(f"Exception uploading wiki cache to Supabase: {str(e)}")
        return False

async def download_wiki_cache_from_supabase(
    owner: str, 
    repo: str, 
    repo_type: str, 
    language: str
) -> Optional[Dict[str, Any]]:
    """
    Download wiki cache data from Supabase storage
    
    Args:
        owner: Repository owner
        repo: Repository name
        repo_type: Repository type
        language: Language code
        
    Returns:
        Dict containing cache data if found, None otherwise
    """
    try:
        supabase = get_supabase_client()
        storage_path = get_storage_path(owner, repo, repo_type, language)
        
        logger.info(f"Downloading wiki cache from Supabase: {storage_path}")
        
        # Download from Supabase storage
        response = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
        
        # Handle different response types
        if isinstance(response, bytes):
            # Direct bytes response - this is the actual file content
            json_content = response.decode('utf-8')
            cache_data = json.loads(json_content)
            logger.info(f"Successfully downloaded wiki cache from Supabase: {storage_path}")
            return cache_data
        elif hasattr(response, 'error') and response.error:
            logger.info(f"Wiki cache not found in Supabase: {storage_path}")
            return None
        elif hasattr(response, 'data') and response.data:
            # Response object with data attribute
            json_content = response.data.decode('utf-8')
            cache_data = json.loads(json_content)
            logger.info(f"Successfully downloaded wiki cache from Supabase: {storage_path}")
            return cache_data
        else:
            logger.info(f"No data returned from Supabase for: {storage_path}")
            return None
        
    except Exception as e:
        logger.error(f"Exception downloading wiki cache from Supabase: {str(e)}")
        return None

async def list_wiki_caches_from_supabase() -> List[Dict[str, Any]]:
    """
    List all wiki cache files from Supabase storage
    
    Returns:
        List of cache file metadata
    """
    try:
        supabase = get_supabase_client()
        
        logger.info("Listing wiki caches from Supabase storage")
        
        # List files in the deepwiki folder
        response = supabase.storage.from_(STORAGE_BUCKET).list("deepwiki")
        
        # Handle different response types
        if isinstance(response, list):
            # Direct list response - this is the file list
            file_list = response
        elif hasattr(response, 'error') and response.error:
            logger.error(f"Error listing files from Supabase storage: {response.error}")
            return []
        elif hasattr(response, 'data') and response.data:
            # Response object with data attribute
            file_list = response.data
        else:
            logger.info(f"No data returned from Supabase storage list")
            return []
            
        cache_files = []
        for file_info in file_list:
            if file_info["name"].startswith("deepwiki_cache_") and file_info["name"].endswith(".json"):
                # Parse filename to extract metadata
                filename = file_info["name"]
                parts = filename.replace("deepwiki_cache_", "").replace(".json", "").split('_')
                
                if len(parts) >= 4:
                    repo_type = parts[0]
                    owner = parts[1]
                    language = parts[-1]
                    repo = "_".join(parts[2:-1])
                    
                    cache_files.append({
                        "id": filename,
                        "owner": owner,
                        "repo": repo,
                        "repo_type": repo_type,
                        "language": language,
                        "name": f"{owner}/{repo}",
                        "created_at": file_info.get("created_at"),
                        "updated_at": file_info.get("updated_at"),
                        "size": file_info.get("size", 0)
                    })
        
        logger.info(f"Found {len(cache_files)} wiki cache files in Supabase")
        return cache_files
        
    except Exception as e:
        logger.error(f"Exception listing wiki caches from Supabase: {str(e)}")
        return []

async def delete_wiki_cache_from_supabase(
    owner: str, 
    repo: str, 
    repo_type: str, 
    language: str
) -> bool:
    """
    Delete wiki cache from Supabase storage
    
    Args:
        owner: Repository owner
        repo: Repository name  
        repo_type: Repository type
        language: Language code
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        supabase = get_supabase_client()
        storage_path = get_storage_path(owner, repo, repo_type, language)
        
        logger.info(f"Deleting wiki cache from Supabase: {storage_path}")
        
        # Delete from Supabase storage
        response = supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        
        if hasattr(response, 'error') and response.error:
            logger.error(f"Error deleting from Supabase storage: {response.error}")
            return False
            
        logger.info(f"Successfully deleted wiki cache from Supabase: {storage_path}")
        return True
        
    except Exception as e:
        logger.error(f"Exception deleting wiki cache from Supabase: {str(e)}")
        return False

def get_public_url(owner: str, repo: str, repo_type: str, language: str) -> Optional[str]:
    """
    Get public URL for wiki cache file in Supabase storage
    
    Args:
        owner: Repository owner
        repo: Repository name
        repo_type: Repository type  
        language: Language code
        
    Returns:
        Public URL if successful, None otherwise
    """
    try:
        supabase = get_supabase_client()
        storage_path = get_storage_path(owner, repo, repo_type, language)
        
        # Get public URL
        response = supabase.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)
        
        # Handle different response types
        if isinstance(response, str):
            # Direct string response - this is the URL
            return response
        elif hasattr(response, 'data'):
            if isinstance(response.data, dict) and 'publicUrl' in response.data:
                return response.data['publicUrl']
            elif isinstance(response.data, str):
                return response.data
        
        return None
        
    except Exception as e:
        logger.error(f"Exception getting public URL from Supabase: {str(e)}")
        return None 