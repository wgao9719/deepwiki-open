import os
import logging
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from typing import List, Optional, Dict, Any, Literal
import json
from datetime import datetime
from pydantic import BaseModel, Field
import google.generativeai as genai
import asyncio
import traceback
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from api.supabase_storage import (
    upload_wiki_cache_to_supabase,
    download_wiki_cache_from_supabase,
    list_wiki_caches_from_supabase,
    delete_wiki_cache_from_supabase,
    get_public_url
)

from api.github_repos import github_fetcher, update_user_repos_background, update_user_repos_initial_background

# Get a logger for this module
logger = logging.getLogger(__name__)

# Get API keys from environment variables
google_api_key = os.environ.get('GOOGLE_API_KEY')

# Configure Google Generative AI
if google_api_key:
    genai.configure(api_key=google_api_key)
else:
    logger.warning("GOOGLE_API_KEY not found in environment variables")

# Initialize FastAPI app
app = FastAPI(
    title="Streaming API",
    description="API for streaming chat completions"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Helper function to get adalflow root path
def get_adalflow_default_root_path():
    return os.path.expanduser(os.path.join("~", ".adalflow"))

# --- Pydantic Models ---
class WikiPage(BaseModel):
    """
    Model for a wiki page.
    """
    id: str
    title: str
    content: str
    filePaths: List[str]
    importance: str # Should ideally be Literal['high', 'medium', 'low']
    relatedPages: List[str]

class ProcessedProjectEntry(BaseModel):
    id: str  # Filename
    owner: str
    repo: str
    name: str  # owner/repo
    repo_type: str # Renamed from type to repo_type for clarity with existing models
    submittedAt: int # Timestamp
    language: str # Extracted from filename

class WikiStructureModel(BaseModel):
    """
    Model for the overall wiki structure.
    """
    id: str
    title: str
    description: str
    pages: List[WikiPage]

class WikiCacheData(BaseModel):
    """
    Model for the data to be stored in the wiki cache.
    """
    wiki_structure: WikiStructureModel
    generated_pages: Dict[str, WikiPage]
    repo_url: Optional[str] = None  # Add repo_url to cache

class WikiCacheRequest(BaseModel):
    """
    Model for the request body when saving wiki cache.
    """
    owner: str
    repo: str
    repo_type: str
    language: str
    wiki_structure: WikiStructureModel
    generated_pages: Dict[str, WikiPage]
    repo_url: Optional[str] = None  # Add repo_url to cache request

class WikiExportRequest(BaseModel):
    """
    Model for requesting a wiki export.
    """
    repo_url: str = Field(..., description="URL of the repository")
    pages: List[WikiPage] = Field(..., description="List of wiki pages to export")
    format: Literal["markdown", "json"] = Field(..., description="Export format (markdown or json)")

# --- Model Configuration Models ---
class Model(BaseModel):
    """
    Model for LLM model configuration
    """
    id: str = Field(..., description="Model identifier")
    name: str = Field(..., description="Display name for the model")

class Provider(BaseModel):
    """
    Model for LLM provider configuration
    """
    id: str = Field(..., description="Provider identifier")
    name: str = Field(..., description="Display name for the provider")
    models: List[Model] = Field(..., description="List of available models for this provider")
    supportsCustomModel: Optional[bool] = Field(False, description="Whether this provider supports custom models")

class ModelConfig(BaseModel):
    """
    Model for the entire model configuration
    """
    providers: List[Provider] = Field(..., description="List of available model providers")
    defaultProvider: str = Field(..., description="ID of the default provider")

from api.config import configs

@app.get("/models/config", response_model=ModelConfig)
async def get_model_config():
    """
    Get available model providers and their models.

    This endpoint returns the configuration of available model providers and their
    respective models that can be used throughout the application.

    Returns:
        ModelConfig: A configuration object containing providers and their models
    """
    try:
        logger.info("Fetching model configurations")

        # Create providers from the config file
        providers = []
        default_provider = configs.get("default_provider", "google")

        # Add provider configuration based on config.py
        for provider_id, provider_config in configs["providers"].items():
            models = []
            # Add models from config
            for model_id in provider_config["models"].keys():
                # Get a more user-friendly display name if possible
                models.append(Model(id=model_id, name=model_id))

            # Add provider with its models
            providers.append(
                Provider(
                    id=provider_id,
                    name=f"{provider_id.capitalize()}",
                    supportsCustomModel=provider_config.get("supportsCustomModel", False),
                    models=models
                )
            )

        # Create and return the full configuration
        config = ModelConfig(
            providers=providers,
            defaultProvider=default_provider
        )
        return config

    except Exception as e:
        logger.error(f"Error creating model configuration: {str(e)}")
        # Return some default configuration in case of error
        return ModelConfig(
            providers=[
                Provider(
                    id="google",
                    name="Google",
                    supportsCustomModel=True,
                    models=[
                        Model(id="gemini-2.0-flash", name="Gemini 2.0 Flash")
                    ]
                )
            ],
            defaultProvider="google"
        )

@app.post("/export/wiki")
async def export_wiki(request: WikiExportRequest):
    """
    Export wiki content as Markdown or JSON.

    Args:
        request: The export request containing wiki pages and format

    Returns:
        A downloadable file in the requested format
    """
    try:
        logger.info(f"Exporting wiki for {request.repo_url} in {request.format} format")

        # Extract repository name from URL for the filename
        repo_parts = request.repo_url.rstrip('/').split('/')
        repo_name = repo_parts[-1] if len(repo_parts) > 0 else "wiki"

        # Get current timestamp for the filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if request.format == "markdown":
            # Generate Markdown content
            content = generate_markdown_export(request.repo_url, request.pages)
            filename = f"{repo_name}_wiki_{timestamp}.md"
            media_type = "text/markdown"
        else:  # JSON format
            # Generate JSON content
            content = generate_json_export(request.repo_url, request.pages)
            filename = f"{repo_name}_wiki_{timestamp}.json"
            media_type = "application/json"

        # Create response with appropriate headers for file download
        response = Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

        return response

    except Exception as e:
        error_msg = f"Error exporting wiki: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/local_repo/structure")
async def get_local_repo_structure(path: str = Query(None, description="Path to local repository")):
    """Return the file tree and README content for a local repository."""
    if not path:
        return JSONResponse(
            status_code=400,
            content={"error": "No path provided. Please provide a 'path' query parameter."}
        )

    if not os.path.isdir(path):
        return JSONResponse(
            status_code=404,
            content={"error": f"Directory not found: {path}"}
        )

    try:
        logger.info(f"Processing local repository at: {path}")
        file_tree_lines = []
        readme_content = ""

        for root, dirs, files in os.walk(path):
            # Exclude hidden dirs/files and virtual envs
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__' and d != 'node_modules' and d != '.venv']
            for file in files:
                if file.startswith('.') or file == '__init__.py' or file == '.DS_Store':
                    continue
                rel_dir = os.path.relpath(root, path)
                rel_file = os.path.join(rel_dir, file) if rel_dir != '.' else file
                file_tree_lines.append(rel_file)
                # Find README.md (case-insensitive)
                if file.lower() == 'readme.md' and not readme_content:
                    try:
                        with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                            readme_content = f.read()
                    except Exception as e:
                        logger.warning(f"Could not read README.md: {str(e)}")
                        readme_content = ""

        file_tree_str = '\n'.join(sorted(file_tree_lines))
        return {"file_tree": file_tree_str, "readme": readme_content}
    except Exception as e:
        logger.error(f"Error processing local repository: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Error processing local repository: {str(e)}"}
        )

def generate_markdown_export(repo_url: str, pages: List[WikiPage]) -> str:
    """
    Generate Markdown export of wiki pages.

    Args:
        repo_url: The repository URL
        pages: List of wiki pages

    Returns:
        Markdown content as string
    """
    # Start with metadata
    markdown = f"# Wiki Documentation for {repo_url}\n\n"
    markdown += f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

    # Add table of contents
    markdown += "## Table of Contents\n\n"
    for page in pages:
        markdown += f"- [{page.title}](#{page.id})\n"
    markdown += "\n"

    # Add each page
    for page in pages:
        markdown += f"<a id='{page.id}'></a>\n\n"
        markdown += f"## {page.title}\n\n"

        # Add related pages
        if page.relatedPages and len(page.relatedPages) > 0:
            markdown += "### Related Pages\n\n"
            related_titles = []
            for related_id in page.relatedPages:
                # Find the title of the related page
                related_page = next((p for p in pages if p.id == related_id), None)
                if related_page:
                    related_titles.append(f"[{related_page.title}](#{related_id})")

            if related_titles:
                markdown += "Related topics: " + ", ".join(related_titles) + "\n\n"

        # Add page content
        markdown += f"{page.content}\n\n"
        markdown += "---\n\n"

    return markdown

def generate_json_export(repo_url: str, pages: List[WikiPage]) -> str:
    """
    Generate JSON export of wiki pages.

    Args:
        repo_url: The repository URL
        pages: List of wiki pages

    Returns:
        JSON content as string
    """
    # Create a dictionary with metadata and pages
    export_data = {
        "metadata": {
            "repository": repo_url,
            "generated_at": datetime.now().isoformat(),
            "page_count": len(pages)
        },
        "pages": [page.model_dump() for page in pages]
    }

    # Convert to JSON string with pretty formatting
    return json.dumps(export_data, indent=2)

# Import the simplified chat implementation
from api.simple_chat import chat_completions_stream
from api.websocket_wiki import handle_websocket_chat
from api.wiki_edit import app as wiki_edit_app  # Import the wiki edit API

# Add the chat_completions_stream endpoint to the main app
app.add_api_route("/chat/completions/stream", chat_completions_stream, methods=["POST"])

# Add the WebSocket endpoint
app.add_websocket_route("/ws/chat", handle_websocket_chat)

# Mount the wiki edit API
app.mount("/wiki", wiki_edit_app)  # Mount the wiki edit API under /wiki prefix

# --- Wiki Cache Helper Functions ---

async def read_wiki_cache(owner: str, repo: str, repo_type: str, language: str) -> Optional[WikiCacheData]:
    """Reads wiki cache data from Supabase storage only."""
    logger.info(f"Loading wiki cache from Supabase for {owner}/{repo} ({repo_type}), lang: {language}")
    try:
        supabase_data = await download_wiki_cache_from_supabase(owner, repo, repo_type, language)
        if supabase_data:
            logger.info(f"Found cache in Supabase storage for {owner}/{repo}")
            return WikiCacheData(**supabase_data)
        else:
            logger.info(f"No cache found in Supabase for {owner}/{repo}")
            return None
    except Exception as e:
        logger.error(f"Error reading from Supabase storage: {e}")
    return None

async def save_wiki_cache(data: WikiCacheRequest) -> bool:
    """Saves wiki cache data to Supabase storage only."""
    logger.info(f"Attempting to save wiki cache to Supabase for {data.owner}/{data.repo} ({data.repo_type}), lang: {data.language}")
    
    try:
        payload = WikiCacheData(
            wiki_structure=data.wiki_structure,
            generated_pages=data.generated_pages,
            repo_url=data.repo_url
        )
        
        # Log size of data to be cached for debugging
        try:
            payload_json = payload.model_dump_json()
            payload_size = len(payload_json.encode('utf-8'))
            logger.info(f"Payload prepared for caching. Size: {payload_size} bytes.")
        except Exception as ser_e:
            logger.warning(f"Could not serialize payload for size logging: {ser_e}")

        # Save to Supabase storage only
        logger.info(f"Uploading wiki cache to Supabase storage")
        supabase_success = await upload_wiki_cache_to_supabase(
            data.owner, 
            data.repo, 
            data.repo_type, 
            data.language, 
            payload.model_dump()
        )
        
        if supabase_success:
            logger.info(f"Wiki cache successfully uploaded to Supabase storage")
            return True
        else:
            logger.error(f"Failed to upload wiki cache to Supabase storage")
            return False
    except Exception as e:
        logger.error(f"Unexpected error saving wiki cache: {e}", exc_info=True)
        return False

# --- Wiki Cache API Endpoints ---

@app.get("/api/wiki_cache", response_model=Optional[WikiCacheData])
async def get_cached_wiki(
    owner: str = Query(..., description="Repository owner"),
    repo: str = Query(..., description="Repository name"),
    repo_type: str = Query(..., description="Repository type (e.g., github, gitlab)"),
    language: str = Query(..., description="Language of the wiki content")
):
    """
    Retrieves cached wiki data (structure and generated pages) for a repository.
    """
    logger.info(f"Attempting to retrieve wiki cache for {owner}/{repo} ({repo_type}), lang: {language}")
    cached_data = await read_wiki_cache(owner, repo, repo_type, language)
    if cached_data:
        return cached_data
    else:
        # Return 200 with null body if not found, as frontend expects this behavior
        # Or, raise HTTPException(status_code=404, detail="Wiki cache not found") if preferred
        logger.info(f"Wiki cache not found for {owner}/{repo} ({repo_type}), lang: {language}")
        return None

@app.post("/api/wiki_cache")
async def store_wiki_cache(request_data: WikiCacheRequest):
    """
    Stores generated wiki data (structure and pages) to the server-side cache.
    """
    logger.info(f"Attempting to save wiki cache for {request_data.owner}/{request_data.repo} ({request_data.repo_type}), lang: {request_data.language}")
    success = await save_wiki_cache(request_data)
    if success:
        return {"message": "Wiki cache saved successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to save wiki cache")

@app.delete("/api/wiki_cache")
async def delete_wiki_cache(
    owner: str = Query(..., description="Repository owner"),
    repo: str = Query(..., description="Repository name"),
    repo_type: str = Query(..., description="Repository type (e.g., github, gitlab)"),
    language: str = Query(..., description="Language of the wiki content")
):
    """
    Deletes a specific wiki cache from Supabase storage.
    """
    logger.info(f"Attempting to delete wiki cache for {owner}/{repo} ({repo_type}), lang: {language}")
    
    try:
        success = await delete_wiki_cache_from_supabase(owner, repo, repo_type, language)
        
        if success:
            logger.info(f"Successfully deleted wiki cache from Supabase: {owner}/{repo}")
            return {"message": f"Wiki cache for {owner}/{repo} ({language}) deleted successfully"}
        else:
            logger.warning(f"Wiki cache not found or could not be deleted: {owner}/{repo}")
            raise HTTPException(status_code=404, detail="Wiki cache not found or could not be deleted")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting wiki cache {owner}/{repo}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete wiki cache: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint for Docker and monitoring"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "deepwiki-api"
    }

@app.get("/")
async def root():
    """Root endpoint to check if the API is running"""
    return {
        "message": "Welcome to Streaming API",
        "version": "1.0.0",
        "endpoints": {
            "Chat": [
                "POST /chat/completions/stream - Streaming chat completion (HTTP)",
                "WebSocket /ws/chat - WebSocket chat completion",
            ],
            "Wiki Cache (Supabase)": [
                "GET /api/wiki_cache - Retrieve cached wiki data from Supabase",
                "POST /api/wiki_cache - Store wiki data to Supabase cache",
                "DELETE /api/wiki_cache - Delete specific wiki cache from Supabase",
                "GET /api/processed_projects - List all cached projects from Supabase"
            ],
            "Wiki Export": [
                "POST /export/wiki - Export wiki content as Markdown or JSON"
            ],
            "Global Wiki Cache": [
                "GET /api/global_wiki_cache - List all global wiki caches",
                "GET /api/global_wiki_cache/{owner}/{repo} - Get specific global wiki cache",
                "GET /api/global_wiki_cache/{owner}/{repo}/url - Get public URL for cache file",
                "DELETE /api/global_wiki_cache/{owner}/{repo} - Delete global wiki cache"
            ],
            "GitHub Repositories": [
                "POST /api/user/github-repos/update - Update user's GitHub repositories",
                "GET /api/user/github-repos/{user_id} - Get user's GitHub repositories",
                "POST /api/user/github-repos/refresh - Force refresh user's repositories",
                "GET /api/user/github-repos/status/{user_id} - Get repository fetch status for debugging",
                "GET /api/user/profile/{user_id} - Get complete user profile with repositories",
                "GET /api/users/github-repos/search - Search users by repository"
            ],
            "LocalRepo": [
                "GET /local_repo/structure - Get structure of a local repository (with path parameter)",
            ],
            "Health": [
                "GET /health - Health check endpoint"
            ]
        }
    }

# --- Processed Projects Endpoint --- (New Endpoint)
@app.get("/api/processed_projects", response_model=List[ProcessedProjectEntry])
async def get_processed_projects():
    """
    Lists all processed projects found in Supabase storage.
    Projects are identified by files named like: deepwiki_cache_{repo_type}_{owner}_{repo}_{language}.json
    """
    try:
        logger.info("Fetching processed projects from Supabase storage")
        
        # Get cache files from Supabase
        cache_files = await list_wiki_caches_from_supabase()
        
        project_entries: List[ProcessedProjectEntry] = []
        
        for cache_file in cache_files:
            try:
                # Convert cache file metadata to ProcessedProjectEntry
                # Parse timestamp from updated_at or created_at
                submitted_at = 0
                if cache_file.get("updated_at"):
                    try:
                        dt = datetime.fromisoformat(cache_file["updated_at"].replace('Z', '+00:00'))
                        submitted_at = int(dt.timestamp() * 1000)
                    except:
                        pass
                elif cache_file.get("created_at"):
                    try:
                        dt = datetime.fromisoformat(cache_file["created_at"].replace('Z', '+00:00'))
                        submitted_at = int(dt.timestamp() * 1000)
                    except:
                        pass

                project_entries.append(
                    ProcessedProjectEntry(
                        id=cache_file["id"],
                        owner=cache_file["owner"],
                        repo=cache_file["repo"],
                        name=cache_file["name"],
                        repo_type=cache_file["repo_type"],
                        submittedAt=submitted_at,
                        language=cache_file["language"]
                    )
                )
            except Exception as e:
                logger.error(f"Error processing cache file metadata: {e}")
                continue

        # Sort by most recent first
        project_entries.sort(key=lambda p: p.submittedAt, reverse=True)
        logger.info(f"Found {len(project_entries)} processed project entries in Supabase.")
        return project_entries

    except Exception as e:
        logger.error(f"Error listing processed projects from Supabase: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list processed projects from Supabase storage.")

# --- Global Wiki Cache Endpoints (Supabase Storage) ---

@app.get("/api/global_wiki_cache", response_model=List[Dict[str, Any]])
async def get_global_wiki_caches():
    """
    Lists all wiki cache files from Supabase storage (global history accessible to all users).
    """
    try:
        logger.info("Fetching global wiki caches from Supabase storage")
        cache_files = await list_wiki_caches_from_supabase()
        return cache_files
    except Exception as e:
        logger.error(f"Error fetching global wiki caches: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch global wiki caches")

@app.get("/api/global_wiki_cache/{owner}/{repo}", response_model=Optional[WikiCacheData])
async def get_global_wiki_cache(
    owner: str,
    repo: str,
    repo_type: str = Query(..., description="Repository type (e.g., github, gitlab)"),
    language: str = Query(default="en", description="Language of the wiki content")
):
    """
    Retrieve a specific wiki cache from Supabase storage (global history).
    """
    try:
        logger.info(f"Fetching global wiki cache for {owner}/{repo} ({repo_type}), lang: {language}")
        supabase_data = await download_wiki_cache_from_supabase(owner, repo, repo_type, language)
        
        if supabase_data:
            return WikiCacheData(**supabase_data)
        else:
            logger.info(f"Global wiki cache not found for {owner}/{repo} ({repo_type}), lang: {language}")
            return None
            
    except Exception as e:
        logger.error(f"Error fetching global wiki cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch global wiki cache")

@app.get("/api/global_wiki_cache/{owner}/{repo}/url")
async def get_global_wiki_cache_url(
    owner: str,
    repo: str,
    repo_type: str = Query(..., description="Repository type (e.g., github, gitlab)"),
    language: str = Query(default="en", description="Language of the wiki content")
):
    """
    Get public URL for a wiki cache file in Supabase storage.
    """
    try:
        logger.info(f"Getting public URL for {owner}/{repo} ({repo_type}), lang: {language}")
        public_url = get_public_url(owner, repo, repo_type, language)
        
        if public_url:
            return {"public_url": public_url}
        else:
            raise HTTPException(status_code=404, detail="Wiki cache file not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting public URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to get public URL")

@app.delete("/api/global_wiki_cache/{owner}/{repo}")
async def delete_global_wiki_cache(
    owner: str,
    repo: str,
    repo_type: str = Query(..., description="Repository type (e.g., github, gitlab)"),
    language: str = Query(default="en", description="Language of the wiki content")
):
    """
    Delete a wiki cache from Supabase storage (global history).
    """
    try:
        logger.info(f"Deleting global wiki cache for {owner}/{repo} ({repo_type}), lang: {language}")
        success = await delete_wiki_cache_from_supabase(owner, repo, repo_type, language)
        
        if success:
            return {"message": f"Global wiki cache for {owner}/{repo} ({language}) deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete global wiki cache")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting global wiki cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete global wiki cache")

# --- GitHub Repositories Endpoints ---

@app.post("/api/user/github-repos/update")
async def update_user_github_repos(
    user_id: str = Query(..., description="User ID"),
    github_username: str = Query(..., description="GitHub username"),
    github_token: str = Query(None, description="Optional GitHub token for higher rate limits")
):
    """
    Update GitHub repositories for a user by fetching from GitHub API
    """
    try:
        logger.info(f"Updating GitHub repos for user {user_id} with username {github_username}")
        
        # Check if this is a new user who has never had repos fetched
        from api.github_repos import SUPABASE_URL, SUPABASE_SERVICE_KEY
        from supabase import create_client
        
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        profile_response = supabase.table('profiles').select('github_repos_updated_at, github_repos').eq('id', user_id).execute()
        
        is_initial_fetch = False
        if profile_response.data:
            profile = profile_response.data[0]
            # Consider it initial fetch if never updated OR has empty repos array
            is_initial_fetch = not profile.get('github_repos_updated_at') or not profile.get('github_repos') or len(profile.get('github_repos', [])) == 0
        
        # Use appropriate background task
        if is_initial_fetch:
            logger.info(f"Detected initial fetch for user {user_id}, bypassing rate limiting")
            asyncio.create_task(update_user_repos_initial_background(user_id, github_username, github_token))
        else:
            logger.info(f"Regular update for user {user_id}, applying rate limiting")
            asyncio.create_task(update_user_repos_background(user_id, github_username, github_token))
        
        return {"message": "GitHub repositories update started", "status": "processing", "initial_fetch": is_initial_fetch}
        
    except Exception as e:
        logger.error(f"Error starting GitHub repos update: {e}")
        raise HTTPException(status_code=500, detail="Failed to start repository update")

@app.get("/api/user/github-repos/{user_id}")
async def get_user_github_repos(user_id: str):
    """
    Get GitHub repositories for a specific user
    """
    try:
        logger.info(f"Fetching GitHub repos for user {user_id}")
        repositories = await github_fetcher.get_user_github_repos(user_id)
        
        return {
            "user_id": user_id,
            "repositories": repositories,
            "count": len(repositories)
        }
        
    except Exception as e:
        logger.error(f"Error fetching GitHub repos for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch repositories")

@app.post("/api/user/github-repos/refresh")
async def refresh_user_github_repos(
    user_id: str = Query(..., description="User ID"),
    github_username: str = Query(..., description="GitHub username"),
    github_token: str = Query(None, description="Optional GitHub token for higher rate limits"),
    force: bool = Query(False, description="Force refresh even if updated recently")
):
    """
    Force refresh GitHub repositories for a user (bypasses 24-hour limit)
    """
    try:
        logger.info(f"Force refreshing GitHub repos for user {user_id}")
        
        if force:
            # Temporarily clear the last updated timestamp to force refresh
            from api.github_repos import SUPABASE_URL, SUPABASE_SERVICE_KEY
            from supabase import create_client
            
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            supabase.table('profiles').update({
                'github_repos_updated_at': None
            }).eq('id', user_id).execute()
        
        # Update repositories
        success = await github_fetcher.update_user_github_repos(user_id, github_username, github_token)
        
        if success:
            return {"message": "GitHub repositories refreshed successfully", "status": "completed"}
        else:
            raise HTTPException(status_code=500, detail="Failed to refresh repositories")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing GitHub repos: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh repositories")

@app.get("/api/user/profile/{user_id}")
async def get_user_profile(user_id: str):
    """
    Get complete user profile including GitHub repositories
    """
    try:
        logger.info(f"Fetching profile for user {user_id}")
        
        from api.github_repos import SUPABASE_URL, SUPABASE_SERVICE_KEY
        from supabase import create_client
        
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        response = supabase.table('profiles').select(
            'id, email, full_name, avatar_url, username, github_username, github_repos, github_repos_updated_at, created_at, updated_at'
        ).eq('id', user_id).execute()
        
        if response.data:
            profile = response.data[0]
            return {
                "profile": profile,
                "repositories_count": len(profile.get('github_repos', []))
            }
        else:
            raise HTTPException(status_code=404, detail="User profile not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user profile")

@app.get("/api/users/github-repos/search")
async def search_users_by_repo(
    repo_name: str = Query(..., description="Repository name to search for"),
    limit: int = Query(10, description="Maximum number of users to return")
):
    """
    Search for users who have contributed to a specific repository
    """
    try:
        logger.info(f"Searching users who contributed to {repo_name}")
        
        from api.github_repos import SUPABASE_URL, SUPABASE_SERVICE_KEY
        from supabase import create_client
        
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Use PostgreSQL's jsonb operators to search within the github_repos array
        response = supabase.table('profiles').select(
            'id, username, github_username, full_name, avatar_url'
        ).filter(
            'github_repos', 'cs', f'[{{"full_name": "{repo_name}"}}]'
        ).limit(limit).execute()
        
        users = []
        for profile in response.data:
            # Find the specific repository in their repos list
            github_repos = profile.get('github_repos', [])
            matching_repo = next((repo for repo in github_repos if repo['full_name'] == repo_name), None)
            
            if matching_repo:
                users.append({
                    "user_id": profile['id'],
                    "username": profile.get('username'),
                    "github_username": profile.get('github_username'),
                    "full_name": profile.get('full_name'),
                    "avatar_url": profile.get('avatar_url'),
                    "repository": matching_repo
                })
        
        return {
            "repository": repo_name,
            "users": users,
            "count": len(users)
        }
        
    except Exception as e:
        logger.error(f"Error searching users by repo: {e}")
        raise HTTPException(status_code=500, detail="Failed to search users")

@app.get("/api/user/github-repos/status/{user_id}")
async def get_user_github_repos_status(user_id: str):
    """
    Get status of GitHub repositories for a user (for debugging)
    """
    try:
        logger.info(f"Checking GitHub repos status for user {user_id}")
        
        from api.github_repos import SUPABASE_URL, SUPABASE_SERVICE_KEY
        from supabase import create_client
        
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        response = supabase.table('profiles').select(
            'id, github_username, github_repos, github_repos_updated_at, created_at'
        ).eq('id', user_id).execute()
        
        if response.data:
            profile = response.data[0]
            repos = profile.get('github_repos', [])
            
            return {
                "user_id": user_id,
                "github_username": profile.get('github_username'),
                "repositories_count": len(repos),
                "last_updated": profile.get('github_repos_updated_at'),
                "profile_created": profile.get('created_at'),
                "has_repos": len(repos) > 0,
                "sample_repos": repos[:3] if repos else []  # Show first 3 repos as sample
            }
        else:
            raise HTTPException(status_code=404, detail="User profile not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking GitHub repos status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check repository status")

@app.get("/debug/memory/{user_id}")
async def debug_memory(
    user_id: str,
    query: str = "",
    namespace: str = "chat",  # or "chat"
    k: int = 5
):
    """Debug endpoint to inspect memories for a user.
    
    Args:
        user_id: The user's ID (from Supabase)
        query: Optional search term
        namespace: Which memory type to search ("prefs" or "chat")
        k: How many results to return
    """
    try:
        from api.memory.semantic import vector_store
        ns = ("mem", namespace, user_id)
        if query:
            results = vector_store.search(ns, query, limit=k)
        else:
            results = vector_store.search(ns, limit=k)
        return {
            "user_id": user_id,
            "namespace": namespace,
            "query": query or "(most recent)",
            "results": results
        }
    except Exception as e:
        return {"error": str(e)}
