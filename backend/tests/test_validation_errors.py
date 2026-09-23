import pytest

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("stored_user", "provider_env")]


async def test_a_leaked_key_is_named_but_not_echoed(client):
    response = await client.post(
        "/api/lessons/generate",
        json={
            "source": "youtube",
            "youtube_url": "https://www.youtube.com/watch?v=abc123",
            "translation_languages": ["en"],
            "openrouter_api_key": "sk-test-12345678",
        },
    )

    assert response.status_code == 422
    assert "sk-test-12345678" not in response.text
    assert response.json()["detail"][0]["loc"] == ["body", "openrouter_api_key"]
    assert response.json()["detail"][0]["type"] == "extra_forbidden"


async def test_a_leaked_key_in_a_form_is_not_echoed(client):
    response = await client.post(
        "/api/pronunciation/assess",
        data={"reference_text": "你好", "azure_key": "sk-test-12345678"},
        files={"audio": ("recording.webm", b"fake-audio", "audio/webm")},
    )

    assert response.status_code == 422
    assert "sk-test-12345678" not in response.text


async def test_other_validation_errors_keep_their_input(client):
    response = await client.post("/api/tts", json={"text": 5})

    assert response.status_code == 422
    assert response.json()["detail"][0]["input"] == 5
