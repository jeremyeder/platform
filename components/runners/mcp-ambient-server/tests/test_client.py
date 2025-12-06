"""Unit tests for API client."""

import pytest
import httpx
from unittest.mock import AsyncMock, patch
from mcp_ambient_server.client import APIClient


@pytest.fixture
def mock_env(monkeypatch):
    """Mock environment variables for testing."""
    monkeypatch.setenv("BOT_TOKEN", "test-token-12345")
    monkeypatch.setenv("BACKEND_API_URL", "http://test-backend:8080/api")


@pytest.fixture
async def api_client(mock_env):
    """Create API client for testing."""
    client = APIClient()
    yield client
    await client.close()


@pytest.mark.asyncio
async def test_client_initialization_success(mock_env):
    """Test successful client initialization with env vars."""
    client = APIClient()
    assert client.base_url == "http://test-backend:8080/api"
    assert client.token == "test-token-12345"
    await client.close()


@pytest.mark.asyncio
async def test_client_initialization_missing_token(monkeypatch):
    """Test client initialization fails without BOT_TOKEN."""
    monkeypatch.delenv("BOT_TOKEN", raising=False)
    with pytest.raises(ValueError, match="BOT_TOKEN"):
        APIClient()


@pytest.mark.asyncio
async def test_list_projects_success(api_client):
    """Test successful project listing."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "items": [
            {"metadata": {"name": "project1"}},
            {"metadata": {"name": "project2"}},
        ]
    }

    with patch.object(api_client.client, "get", return_value=mock_response):
        projects = await api_client.list_projects()
        assert len(projects) == 2
        assert projects[0]["metadata"]["name"] == "project1"


@pytest.mark.asyncio
async def test_get_project_not_found(api_client):
    """Test getting non-existent project returns 404."""
    mock_response = AsyncMock()
    mock_response.status_code = 404

    with patch.object(api_client.client, "get", return_value=mock_response):
        with pytest.raises(Exception, match="not found"):
            await api_client.get_project("nonexistent")


@pytest.mark.asyncio
async def test_authentication_error(api_client):
    """Test 401 response raises authentication error."""
    mock_response = AsyncMock()
    mock_response.status_code = 401

    with patch.object(api_client.client, "get", return_value=mock_response):
        with pytest.raises(Exception, match="Authentication failed"):
            await api_client.list_projects()


@pytest.mark.asyncio
async def test_authorization_error(api_client):
    """Test 403 response raises access denied error."""
    mock_response = AsyncMock()
    mock_response.status_code = 403

    with patch.object(api_client.client, "get", return_value=mock_response):
        with pytest.raises(Exception, match="Access denied"):
            await api_client.get_project("forbidden-project")


@pytest.mark.asyncio
async def test_server_error(api_client):
    """Test 500 response raises backend error."""
    mock_response = AsyncMock()
    mock_response.status_code = 500
    mock_response.json.return_value = {"error": "Internal server error"}

    with patch.object(api_client.client, "get", return_value=mock_response):
        with pytest.raises(Exception, match="Backend API error"):
            await api_client.list_projects()


@pytest.mark.asyncio
async def test_connection_error(api_client):
    """Test connection error raises connectivity message."""
    with patch.object(
        api_client.client,
        "get",
        side_effect=httpx.ConnectError("Connection refused"),
    ):
        with pytest.raises(Exception, match="Cannot reach backend API"):
            await api_client.list_projects()


@pytest.mark.asyncio
async def test_timeout_error(api_client):
    """Test timeout error raises timeout message."""
    with patch.object(
        api_client.client,
        "get",
        side_effect=httpx.TimeoutException("Timeout"),
    ):
        with pytest.raises(Exception, match="timed out"):
            await api_client.list_projects()


@pytest.mark.asyncio
async def test_path_traversal_protection(api_client):
    """Test that path traversal attempts are blocked."""
    with pytest.raises(ValueError, match="cannot contain"):
        await api_client.get_workspace_file(
            "test-project", "test-session", "../etc/passwd"
        )


@pytest.mark.asyncio
async def test_list_sessions_success(api_client):
    """Test successful session listing."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "items": [
            {"metadata": {"name": "session1"}},
            {"metadata": {"name": "session2"}},
        ]
    }

    with patch.object(api_client.client, "get", return_value=mock_response):
        sessions = await api_client.list_sessions("test-project")
        assert len(sessions) == 2


@pytest.mark.asyncio
async def test_get_workspace_file_success(api_client):
    """Test successful workspace file retrieval."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "content": "file contents",
        "path": "README.md",
    }

    with patch.object(api_client.client, "get", return_value=mock_response):
        file_data = await api_client.get_workspace_file(
            "test-project", "test-session", "README.md"
        )
        assert file_data["path"] == "README.md"
        assert file_data["content"] == "file contents"
