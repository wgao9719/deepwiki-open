import logging
import os
from typing import List, Optional
from urllib.parse import unquote
import re

import google.generativeai as genai
from adalflow.components.model_client.ollama_client import OllamaClient
from adalflow.core.types import ModelType
from fastapi import FastAPI, HTTPException, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import jwt

from api.config import get_model_config
from api.data_pipeline import count_tokens
from api.openai_client import OpenAIClient
from api.openrouter_client import OpenRouterClient
from api.bedrock_client import BedrockClient
from api.rag import RAG
from api.supabase_storage import download_wiki_cache_from_supabase

# Unified logging setup
from api.logging_config import setup_logging

setup_logging()
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
    title="Wiki Edit API",
    description="Specialized API for AI-powered wiki editing with RAG integration"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models for the API
class WikiEditRequest(BaseModel):
    """Model for requesting wiki editing suggestions."""
    repo_url: str = Field(..., description="URL of the repository")
    current_page_title: str = Field(..., description="Title of the current wiki page being edited")
    current_page_content: Optional[str] = Field(None, description="Current content of the wiki page (if not provided, will be fetched from wiki cache)")
    current_page_files: List[str] = Field(..., description="List of files related to this wiki page")
    # Optional: Specific chunk of the wiki page that the user highlighted / pasted into the edit request
    # If this is provided, the model should ONLY modify this chunk and leave the rest of the document untouched.
    highlighted_content: Optional[str] = Field(None, description="Exact chunk of the wiki page that the user wants to modify exclusively")
    edit_request: str = Field(..., description="The user's editing request or instruction")
    token: Optional[str] = Field(None, description="Personal access token for private repositories")
    type: Optional[str] = Field("github", description="Type of repository")

    # model parameters
    provider: str = Field("google", description="Model provider")
    model: Optional[str] = Field(None, description="Model name for the specified provider")
    language: Optional[str] = Field("en", description="Language for content generation")

    excluded_dirs: Optional[str] = Field(None, description="Comma-separated list of directories to exclude")
    excluded_files: Optional[str] = Field(None, description="Comma-separated list of file patterns to exclude")
    included_dirs: Optional[str] = Field(None, description="Comma-separated list of directories to include exclusively")
    included_files: Optional[str] = Field(None, description="Comma-separated list of file patterns to include exclusively")

    # user identification for personalized memory
    user_id: Optional[str] = Field(None, description="Authenticated user identifier")

    # Optional: Pass the complete wiki content (all pages) so that the model can reference
    entire_wiki_content: Optional[str] = Field(None, description="Concatenated markdown of the entire repository wiki for additional context")

    # Memory and preferences for better continuity
    edit_memory: Optional[List[dict]] = Field(None, description="Recent edit history for context and continuity")
    user_preferences: Optional[dict] = Field(None, description="User preferences for writing style and formatting")

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

@app.post("/edit/suggestions")
async def get_wiki_edit_suggestions(request_data: WikiEditRequest, http_request: FastAPIRequest):
    """Generate AI-powered editing suggestions for wiki pages using RAG"""
    # Derive user_id from body or Supabase JWT
    user_id = request_data.user_id
    if not user_id:
        auth_header = http_request.headers.get("Authorization") or http_request.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                # If secret is provided verify signature, else decode w/o verify
                if SUPABASE_JWT_SECRET:
                    decoded = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"])
                else:
                    decoded = jwt.decode(token, options={"verify_signature": False})
                user_id = decoded.get("sub") or decoded.get("user_id")
            except Exception as e:
                logger.warning(f"Failed to decode Supabase JWT: {e}")

    # Reconstruct request object with resolved user_id for downstream logic
    request = request_data
    request.user_id = user_id

    try:
        # Normalize provider and model defaults
        provider = (request.provider or "google").strip()
        if provider == "":
            provider = "google"

        # If model not specified, get default from config for this provider
        if request.model is None or request.model.strip() == "":
            try:
                provider_config = get_model_config(provider, None)
                request.model = provider_config.get("default_model") if isinstance(provider_config, dict) else None
            except Exception:
                request.model = None

        request.provider = provider

        # -----------------------------
        # Retrieve full wiki content from Supabase cache
        # -----------------------------
        try:
            def _extract_owner_repo(url: str):
                """Extract owner and repo name from repository URL (supports GitHub/GitLab https or ssh formats)."""
                if not url:
                    return None, None
                # Strip possible .git suffix
                url_no_git = url.rstrip('.git')
                # Use regex to capture owner and repo between domain and optional .git
                match = re.search(r"(?:github\.com|gitlab\.com)[/:](?P<owner>[^/]+)/(?P<repo>[^/]+)$", url_no_git)
                if match:
                    return match.group('owner'), match.group('repo')
                return None, None

            owner, repo = _extract_owner_repo(request.repo_url)
            if owner and repo:
                wiki_cache = await download_wiki_cache_from_supabase(owner, repo, request.type or 'github', request.language or 'en')
                if wiki_cache:
                    pages_content = []
                    fetched_current_page_content = None
                    # wiki_structure pages
                    try:
                        wiki_structure = wiki_cache.get('wiki_structure', {})
                        for page in wiki_structure.get('pages', []):
                            title = page.get('title') or page.get('id') or 'Untitled'
                            content = page.get('content', '')
                            pages_content.append(f"# {title}\n\n{content}")
                            # capture current page content if title matches
                            if not fetched_current_page_content and title.strip().lower() == (request.current_page_title or '').strip().lower():
                                fetched_current_page_content = content
                    except Exception as e:
                        logger.warning(f"Error processing wiki_structure pages: {e}")
                    # generated_pages may contain additional pages
                    try:
                        for page in (wiki_cache.get('generated_pages') or {}).values():
                            title = page.get('title') or page.get('id') or 'Untitled'
                            content = page.get('content', '')
                            pages_content.append(f"# {title}\n\n{content}")
                            if not fetched_current_page_content and title.strip().lower() == (request.current_page_title or '').strip().lower():
                                fetched_current_page_content = content
                    except Exception as e:
                        logger.warning(f"Error processing generated_pages: {e}")

                    if fetched_current_page_content and not request.current_page_content:
                        request.current_page_content = fetched_current_page_content
                        logger.info("Auto-populated current_page_content from Supabase cache")

                    if pages_content:
                        request.entire_wiki_content = "\n\n---\n\n".join(pages_content)
                        logger.info(f"Loaded entire wiki content comprising {len(pages_content)} pages ({len(request.entire_wiki_content)} characters)")
                    else:
                        logger.warning("No wiki pages found in Supabase cache")
                else:
                    logger.warning(f"No wiki cache found in Supabase for {owner}/{repo}")
            else:
                logger.warning(f"Could not extract owner/repo from URL: {request.repo_url}")
        except Exception as wiki_err:
            logger.warning(f"Failed to retrieve full wiki content from Supabase: {wiki_err}")

        # Include highlighted_content in token counting so we warn on very large requests
        total_content = (request.current_page_content or "") + (request.highlighted_content or "") + request.edit_request + (request.entire_wiki_content or "")
        tokens = count_tokens(total_content, request.provider == "ollama")
        logger.info(f"Wiki edit request size: {tokens} tokens")

        # Log memory and preferences usage
        memory_count = len(request.edit_memory) if request.edit_memory else 0
        has_preferences = bool(request.user_preferences and any(request.user_preferences.values()))
        logger.info(f"Memory context: {memory_count} previous edits, User preferences: {'Yes' if has_preferences else 'No'}")

        input_too_large = tokens > 8000
        if input_too_large:
            logger.warning(f"Request exceeds recommended token limit ({tokens} > 8000)")

        # Try to prepare RAG retriever, but make it optional
        request_rag = None
        rag_available = False
        
        try:
            request_rag = RAG(provider=request.provider, model=request.model)

            excluded_dirs = None
            excluded_files = None
            included_dirs = None
            included_files = None

            if request.excluded_dirs:
                excluded_dirs = [unquote(dir_path) for dir_path in request.excluded_dirs.split('\n') if dir_path.strip()]
            if request.excluded_files:
                excluded_files = [unquote(file_pattern) for file_pattern in request.excluded_files.split('\n') if file_pattern.strip()]
            if request.included_dirs:
                included_dirs = [unquote(dir_path) for dir_path in request.included_dirs.split('\n') if dir_path.strip()]
            if request.included_files:
                included_files = [unquote(file_pattern) for file_pattern in request.included_files.split('\n') if file_pattern.strip()]

            request_rag.prepare_retriever(request.repo_url, request.type, request.token, excluded_dirs, excluded_files, included_dirs, included_files)
            rag_available = True
            logger.info(f"RAG retriever prepared for wiki editing: {request.repo_url}")
        except Exception as e:
            logger.warning(f"RAG retriever not available: {str(e)} - Proceeding with memory-only editing")
            request_rag = None
            rag_available = False

        rag_query = f"Wiki page editing context for '{request.current_page_title}' covering files: {', '.join(request.current_page_files)}. Edit request: {request.edit_request}"

        context_text = ""
        if not input_too_large and rag_available and request_rag:
            try:
                retrieved_documents = request_rag(rag_query, language=request.language)

                if retrieved_documents and retrieved_documents[0].documents:
                    documents = retrieved_documents[0].documents
                    logger.info(f"Retrieved {len(documents)} documents for wiki editing")

                    prioritized_docs = []
                    other_docs = []
                    for doc in documents:
                        file_path = doc.meta_data.get('file_path', 'unknown')
                        if any(page_file in file_path for page_file in request.current_page_files):
                            prioritized_docs.append(doc)
                        else:
                            other_docs.append(doc)

                    all_docs = prioritized_docs + other_docs

                    docs_by_file = {}
                    for doc in all_docs:
                        file_path = doc.meta_data.get('file_path', 'unknown')
                        if file_path not in docs_by_file:
                            docs_by_file[file_path] = []
                        docs_by_file[file_path].append(doc)

                    context_parts = []
                    for file_path, docs in docs_by_file.items():
                        is_current_page_file = any(page_file in file_path for page_file in request.current_page_files)
                        header = f"## File Path: {file_path}" + (" (Current Page File)" if is_current_page_file else "") + "\n\n"
                        content = "\n\n".join([doc.text for doc in docs])
                        context_parts.append(f"{header}{content}")

                    context_text = "\n\n" + "-" * 20 + "\n\n".join(context_parts)
                    logger.info(f"Formatted context with {len(prioritized_docs)} prioritized docs and {len(other_docs)} additional docs")
            except Exception as e:
                logger.warning(f"Error in RAG retrieval: {str(e)} - Proceeding without RAG context")
                context_text = ""

        language_code = request.language or "en"
        language_name = {
            "en": "English",
            "ja": "Japanese (日本語)",
            "zh": "Mandarin Chinese (中文)",
            "es": "Spanish (Español)",
            "kr": "Korean (한국어)",
            "vi": "Vietnamese (Tiếng Việt)"
        }.get(language_code, "English")

        # Build memory context from recent edits
        memory_context = ""
        if request.edit_memory and len(request.edit_memory) > 0:
            memory_parts = []
            for edit in request.edit_memory[-5:]:  # Use last 5 edits for context
                timestamp = edit.get('timestamp', 0)
                prompt = edit.get('prompt', '')
                response = edit.get('response', '')
                page_id = edit.get('pageId', '')
                
                if prompt and response:
                    memory_parts.append(f"Previous edit on '{page_id}':\nUser: {prompt}\nAssistant: {response[:200]}..." if len(response) > 200 else f"Previous edit on '{page_id}':\nUser: {prompt}\nAssistant: {response}")
            
            if memory_parts:
                memory_context = f"\n\n<previous_edits>\n{chr(10).join(memory_parts)}\n</previous_edits>"

        # Build user preferences context
        preferences_context = ""
        if request.user_preferences:
            prefs = request.user_preferences
            pref_parts = []
            
            if prefs.get('writingStyle'):
                pref_parts.append(f"Preferred writing style: {prefs['writingStyle']}")
            
            if prefs.get('preferredFormats'):
                formats = ', '.join(prefs['preferredFormats'])
                pref_parts.append(f"Preferred formats: {formats}")
            
            if prefs.get('commonInstructions'):
                instructions = '; '.join(prefs['commonInstructions'])
                pref_parts.append(f"Common user instructions: {instructions}")
            
            if pref_parts:
                preferences_context = f"\n\n<user_preferences>\n{chr(10).join(pref_parts)}\n</user_preferences>"

        system_prompt = f"""<role>
You are an expert technical writer and AI assistant specialized in editing and improving software documentation wikis.
You provide direct, actionable editing suggestions based on codebase analysis. Your edits MUST have good fit with the existing codebase and not overlap too much with the existing wiki. You MUST produce the highest quality writing possible that is grounded in the actual codebase and looks as human-written as possible.
IMPORTANT: You MUST respond in {language_name} language. If {request.highlighted_content} is not empty, the you can ONLY edit the text in {request.highlighted_content} and you CANNOT edit anything else or you will be fired.
IMPORTANT: All edits that you suggest MUST be grounded in the actual codebase and stay relevant and on-topic with the current page content and the codebase. DO NOT allow the user to make edits that irrelevant or off-topic to the codebase.
IMPORTANT: If a user's query is irrelevant or off-topic to the codebase, you MUST respond in this exact format:
### IRRELEVANT_QUERY
[Explanation of why the query is irrelevant or off-topic]
I'm sorry, I cannot help you with that.
IMPORTANT: Be very strict with irrelevant and off-topic queries. If a user's query is irrelevant or off-topic to the codebase, respond with why it is off-topic and say "I'm sorry, I cannot help you with that."
</role>

<guidelines>
- You are editing a wiki page titled: "{request.current_page_title}"
- The page primarily covers these files: {', '.join(request.current_page_files)}
- The current page the user wants to edit on is provided here: "{request.current_page_content}"
- Use the current page content and read the user prompt thoroughly to understand exactly where and what the edit is supposed to implement
- Use the current page content and the user query to target exactly where the user wants to edit and implement the best edit possible at that location
- If the user uses the word "lengthen" in their query for a specific location or section on the current page content; add more relevant, accurate and organic detail to increase the section size by 50%
- Focus on providing specific, actionable editing suggestions
- This is the context for the entire wiki documentation: "{request.entire_wiki_content}"  
- Use the full wiki context to make sure that the edits are tailored specifically to this wiki and the edits don't overlap with existing information
- Use the full wiki context to provide novel and organic edits that make sense with respect to the existing codebase
- Use the provided codebase context and the full wiki context to ensure accuracy and consistency across pages
- Suggest concrete improvements, additions, or modifications
- Be very strict and stringent with irrelevant and off-topic queries. Do NOT make or suggest edits that are irrelevant to the codebase ever, rather if the user's query is irrelevant or off-topic to the codebase just say "I'm sorry, I cannot help you with that."
- Maintain existing markdown structure and formatting style
- When suggesting code examples, use real code from the repository
- Provide clear rationale for each suggestion
- Structure your response with clear headings and bullet points
- Be specific about which sections to modify and how
- If a <selected_chunk> is provided, ONLY modify that chunk according to the <edit_request>. All other content in the page must remain IDENTICAL.
- Do NOT delete to or add to any other part of the document other than <selected_chunk> when <selected_chunk> is present.
- Do NOT rewrite or re-format other parts of the document when <selected_chunk> is present.
{memory_context}
{preferences_context}
</guidelines>

<response_format>
If the query is relevant, return exactly two top-level markdown sections in this order:

### Editing Suggestions
* List each change with **What to change** [Specficic Description of the change] and **Why** [Rational based on Codebase and Wiki] bullets.

### Revised Document
The complete revised markdown for the entire page **after** applying every suggestion above.

If the query is irrelevant, return exactly this format:
### IRRELEVANT_QUERY
[Explanation of why the query is irrelevant or off-topic]
I'm sorry, I cannot help you with that.

No extra prose before or after these sections.
</response_format>"""

        full_prompt = f"{system_prompt}\n\n"
        full_prompt += f"<current_page_content>\n{request.current_page_content or ''}\n</current_page_content>\n\n"

        # Inject the highlighted chunk if supplied
        if request.highlighted_content:
            full_prompt += f"<selected_chunk>\n{request.highlighted_content}\n</selected_chunk>\n\n"

        # Append the full wiki context if supplied by the caller
        if request.entire_wiki_content:
            full_prompt += f"<full_wiki_context>\n{request.entire_wiki_content}\n</full_wiki_context>\n\n"

        if context_text.strip():
            full_prompt += f"<codebase_context>\n{context_text}\n</codebase_context>\n\n"
        else:
            if rag_available:
                full_prompt += "<note>Limited codebase context available from RAG.</note>\n\n"
            else:
                full_prompt += "<note>RAG codebase context not available - using memory and wiki context only.</note>\n\n"

        full_prompt += f"<edit_request>\n{request.edit_request}\n</edit_request>\n\nAssistant: "

        user_memory_snippets = ""
        if request.user_id:
            try:
                from api.memory.semantic import vector_store

                search_query = request.edit_request or request.current_page_title
                collected: list[str] = []
                for ns in [("mem", "prefs", request.user_id), ("mem", "chat", request.user_id)]:
                    try:
                        if search_query:
                            docs = vector_store.search(ns, search_query, limit=3)
                        else:
                            docs = vector_store.search(ns, limit=3)
                        for d in docs:
                            text = d if isinstance(d, str) else d.get("text") or d.get("page") or str(d)
                            collected.append(text)
                    except Exception:
                        pass
                if collected:
                    user_memory_snippets = "\n\n".join(collected[:6])
            except Exception as mem_err:
                logger.warning(f"Could not fetch user memories: {mem_err}")

        full_prompt += f"<user_memory>\n{user_memory_snippets}\n</user_memory>\n\n"

        model_config = get_model_config(request.provider, request.model)["model_kwargs"]

        if request.provider == "ollama":
            full_prompt += " /no_think"
            model = OllamaClient()
            model_kwargs = {
                "model": model_config["model"],
                "stream": True,
                "options": {
                    "temperature": model_config["temperature"],
                    "top_p": model_config["top_p"],
                    "num_ctx": model_config["num_ctx"]
                }
            }
            api_kwargs = model.convert_inputs_to_api_kwargs(
                input=full_prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
        elif request.provider == "openrouter":
            if not os.environ.get("OPENROUTER_API_KEY"):
                logger.warning("OPENROUTER_API_KEY not set")
            model = OpenRouterClient()
            model_kwargs = {
                "model": request.model,
                "stream": True,
                "temperature": model_config["temperature"],
                "top_p": model_config["top_p"]
            }
            api_kwargs = model.convert_inputs_to_api_kwargs(
                input=full_prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
        elif request.provider == "openai":
            if not os.environ.get("OPENAI_API_KEY"):
                logger.warning("OPENAI_API_KEY not set")
            model = OpenAIClient()
            model_kwargs = {
                "model": request.model,
                "stream": True,
                "temperature": model_config["temperature"],
                "top_p": model_config["top_p"]
            }
            api_kwargs = model.convert_inputs_to_api_kwargs(
                input=full_prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
        elif request.provider == "bedrock":
            if not os.environ.get("AWS_ACCESS_KEY_ID") or not os.environ.get("AWS_SECRET_ACCESS_KEY"):
                logger.warning("AWS credentials not set")
            model = BedrockClient()
            model_kwargs = {
                "model": request.model,
                "temperature": model_config["temperature"],
                "top_p": model_config["top_p"]
            }
            api_kwargs = model.convert_inputs_to_api_kwargs(
                input=full_prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
        else:
            model = genai.GenerativeModel(
                model_name=model_config["model"],
                generation_config={
                    "temperature": model_config["temperature"],
                    "top_p": model_config["top_p"],
                    "top_k": model_config["top_k"]
                }
            )

        async def response_stream():
            try:
                if request.provider in ["ollama", "openrouter", "openai", "bedrock"]:
                    response = await model.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
                    if request.provider == "ollama":
                        async for chunk in response:
                            text = getattr(chunk, 'response', None) or getattr(chunk, 'text', None) or str(chunk)
                            if text and not text.startswith('model=') and not text.startswith('created_at='):
                                text = text.replace('<think>', '').replace('</think>', '')
                                yield text
                    elif request.provider == "openai":
                        async for chunk in response:
                            choices = getattr(chunk, "choices", [])
                            if len(choices) > 0:
                                delta = getattr(choices[0], "delta", None)
                                if delta is not None:
                                    text = getattr(delta, "content", None)
                                    if text is not None:
                                        yield text
                    else:
                        async for chunk in response:
                            yield chunk
                else:
                    response = model.generate_content(full_prompt, stream=True)
                    for chunk in response:
                        if hasattr(chunk, 'text'):
                            yield chunk.text

            except Exception as e:
                logger.error(f"Error in wiki edit streaming: {str(e)}")
                yield f"\nError generating suggestions: {str(e)}"

        async def final_stream():
            collected_response = ""
            async for chunk in response_stream():
                collected_response += chunk
                yield chunk

            if request.user_id:
                try:
                    from api.memory.manager import process_turn
                    import asyncio
                    messages_for_mem = [
                        {"role": "user", "content": request.edit_request},
                        {"role": "assistant", "content": collected_response},
                    ]
                    asyncio.create_task(process_turn(messages_for_mem, user_id=request.user_id, namespace="chat"))
                except Exception as mgr_err:
                    logger.warning(f"Memory manager update failed: {mgr_err}")

        return StreamingResponse(final_stream(), media_type="text/event-stream")

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error in wiki edit suggestions: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/")
async def root():
    """Root endpoint to check if the Wiki Edit API is running"""
    return {"status": "Wiki Edit API is running", "message": "Navigate to /docs for API documentation"} 