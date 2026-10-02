"""Ask a model one thing. Used by server.py for the question pipeline.

Reads one JSON request on stdin:
    {"system": "...", "prompt": "...", "effort": "low|medium|high", "max_tokens": 2000}
and writes one JSON line on stdout:
    {"text": "..."}  or  {"error": "..."}

Any provider will do. Claude goes through the Anthropic SDK; everything else
speaks the OpenAI chat-completions format (OpenAI, OpenRouter, Gemini, Groq,
DeepSeek, a local Ollama, or any other address), sent with urllib so it needs
nothing installed. server.py runs this through `uv run --with anthropic`, the
same way tts.py gets edge-tts, so the system Python is never touched.

Which provider, model and key: model.local beside this file (ignored by git),
written by the app's "Connect the model" box. Before that exists, an older
anthropic-key.local, then ANTHROPIC_API_KEY. Other providers' variables are
deliberately not read: a stale one would make the app claim a model it cannot use.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
CONFIG_FILE = HERE / "model.local"
OLD_KEY_FILE = HERE / "anthropic-key.local"

# The defaults are only a starting point: the model name is editable in the app.
PROVIDERS = [
    {"id": "anthropic", "label": "Anthropic (Claude)", "base": "", "model": "claude-opus-5-5", "key": True},
    {"id": "openai", "label": "OpenAI", "base": "https://api.openai.com/v1", "model": "gpt-4o", "key": True},
    {"id": "openrouter", "label": "OpenRouter (many models, one key)", "base": "https://openrouter.ai/api/v1", "model": "moonshotai/kimi-k2", "key": True},
    {"id": "gemini", "label": "Google Gemini", "base": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.5-flash", "key": True},
    {"id": "groq", "label": "Groq", "base": "https://api.groq.com/openai/v1", "model": "qwen/qwen3.8-27b", "key": True},
    {"id": "deepseek", "label": "DeepSeek", "base": "https://api.deepseek.com/v1", "model": "deepseek-chat", "key": True},
    {"id": "ollama", "label": "Ollama (on this computer, no key)", "base": "http://localhost:11434/v1", "model": "llama3.1", "key": False},
    {"id": "custom", "label": "Other (OpenAI-compatible address)", "base": "", "model": "", "key": False},
]
BY_ID = {p["id"]: p for p in PROVIDERS}


def provider(pid):
    return BY_ID.get(pid) or BY_ID["custom"]


def normalise(cfg):
    """Fill a partial config from its provider's defaults."""
    cfg = dict(cfg or {})
    p = provider(cfg.get("provider") or "anthropic")
    return {
        "provider": p["id"],
        "model": (cfg.get("model") or "").strip() or p["model"],
        "base_url": ((cfg.get("base_url") or "").strip() or p["base"]).rstrip("/"),
        "key": (cfg.get("key") or "").strip(),
    }


def load_config():
    # What was last set in the app wins over anything in the environment, so a
    # stale shell variable cannot quietly override it mid-demo.
    if CONFIG_FILE.exists():
        try:
            return normalise(json.loads(CONFIG_FILE.read_text()))
        except ValueError:
            pass
    if OLD_KEY_FILE.exists() and OLD_KEY_FILE.read_text().strip():
        return normalise({"provider": "anthropic", "key": OLD_KEY_FILE.read_text()})
    if os.environ.get("ANTHROPIC_API_KEY"):
        return normalise({"provider": "anthropic", "key": os.environ["ANTHROPIC_API_KEY"],
                          "model": os.environ.get("TUTOR_MODEL", "")})
    return None


def save_config(cfg):
    CONFIG_FILE.write_text(json.dumps(normalise(cfg)) + "\n")
    CONFIG_FILE.chmod(0o600)
    OLD_KEY_FILE.unlink(missing_ok=True)


def remove_config():
    CONFIG_FILE.unlink(missing_ok=True)
    OLD_KEY_FILE.unlink(missing_ok=True)


def problem(cfg):
    """Why this config cannot be used, or "" if it can."""
    if not cfg:
        return "no model connected yet"
    p = provider(cfg["provider"])
    if p["key"] and not cfg["key"]:
        return "no key for " + p["label"]
    if not cfg["base_url"] and cfg["provider"] != "anthropic":
        return "no address for the model"
    if not cfg["model"]:
        return "no model name"
    return ""


def status():
    """What the app shows: never the key itself."""
    cfg = load_config()
    why = problem(cfg)
    return {
        "ready": not why, "why": why,
        "provider": cfg["provider"] if cfg else "", "model": cfg["model"] if cfg else "",
        "label": provider(cfg["provider"])["label"] if cfg else "",
        "base_url": cfg["base_url"] if cfg else "",
        "providers": PROVIDERS,
    }


def ask_anthropic(cfg, req):
    import anthropic

    client = anthropic.Anthropic(api_key=cfg["key"], timeout=90.0, max_retries=1)
    try:
        response = client.beta.messages.create(
            model=cfg["model"],
            max_tokens=int(req.get("max_tokens") or 2000),
            system=req.get("system") or "",
            messages=[{"role": "user", "content": req.get("prompt") or ""}],
            output_config={"effort": req.get("effort") or "medium"},
            # On a policy decline, the API re-runs the request on a fallback
            # model inside the same call, so a learner is not left with nothing.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        return {"error": "the API key was refused"}
    except anthropic.RateLimitError:
        return {"error": "rate limited, try again in a moment"}
    except anthropic.APIStatusError as e:
        return {"error": "model error {}: {}".format(e.status_code, str(e.message)[:200])}
    except anthropic.APIConnectionError:
        return {"error": "could not reach the model (network)"}

    if response.stop_reason == "refusal":
        return {"error": "the model declined"}
    text = "".join(b.text for b in response.content if b.type == "text")
    if not text.strip():
        return {"error": "empty reply (stop: {})".format(response.stop_reason)}
    return {"text": text, "stop": response.stop_reason}


def ask_openai_compatible(cfg, req):
    body = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": req.get("system") or ""},
            {"role": "user", "content": req.get("prompt") or ""},
        ],
        # Every prompt in the pipeline asks for one JSON object. JSON mode
        # makes that reliable where the provider supports it; where it does
        # not, the request is sent again without it.
        "response_format": {"type": "json_object"},
    }
    limit = int(req.get("max_tokens") or 2000)
    # OpenAI's newer models only take max_completion_tokens; the rest of the
    # world still says max_tokens.
    body["max_completion_tokens" if cfg["provider"] == "openai" else "max_tokens"] = limit
    headers = {"Content-Type": "application/json", "User-Agent": "tutor-simple"}
    if cfg["key"]:
        headers["Authorization"] = "Bearer " + cfg["key"]
    if cfg["provider"] == "openrouter":
        headers["X-Title"] = "Tutor"

    def send(payload):
        request = urllib.request.Request(cfg["base_url"] + "/chat/completions",
                                         data=json.dumps(payload).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(request, timeout=90) as r:
            return json.loads(r.read().decode("utf-8"))

    try:
        try:
            data = send(body)
        except urllib.error.HTTPError as e:
            if e.code not in (400, 422):
                raise
            body.pop("response_format", None)
            data = send(body)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        if e.code in (401, 403):
            return {"error": "the API key was refused"}
        if e.code == 429:
            return {"error": "rate limited, try again in a moment"}
        if e.code == 404:
            return {"error": "model or address not found ({}): {}".format(cfg["model"], detail)}
        return {"error": "model error {}: {}".format(e.code, detail)}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {"error": "could not reach the model (network): {}".format(getattr(e, "reason", e))}
    except ValueError:
        return {"error": "the model's reply was not JSON"}

    choice = (data.get("choices") or [{}])[0]
    text = ((choice.get("message") or {}).get("content")) or ""
    if isinstance(text, list):          # a few providers return content parts
        text = "".join(part.get("text", "") for part in text if isinstance(part, dict))
    if not text.strip():
        return {"error": "empty reply (stop: {})".format(choice.get("finish_reason"))}
    return {"text": text, "stop": choice.get("finish_reason")}


def ask(req):
    # A config being tried out from the app arrives with the request; it is
    # only saved once this call has proved it works.
    cfg = normalise(req["config"]) if req.get("config") else load_config()
    why = problem(cfg)
    if why:
        return {"error": why}
    if cfg["provider"] == "anthropic":
        return ask_anthropic(cfg, req)
    return ask_openai_compatible(cfg, req)


def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    req = json.loads(sys.stdin.read() or "{}")
    out(status() if req.get("check") else ask(req))


if __name__ == "__main__":
    main()
