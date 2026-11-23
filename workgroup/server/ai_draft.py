# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 주간보고 AI 초안 (Workgroup) — Claude API 로 총괄 요약 세 칸의 초안을 만듦

  켜기: conf/app.ini [features] ai_draft=1, 서버 PC 에 `pip install anthropic`, 환경 변수 ANTHROPIC_API_KEY
        (키는 서버에만 둠 — 화면 · 저장소 · app.ini 에 쓰지 않음). 서버가 api.anthropic.com 에 나갈 수 있어야 함
  POST /api/ai/weekly-draft  {week, scope, curTasks, nextTasks, risks, meetings, prev}
        → {ok, draft: {currentWeekSummary, nextWeekSummary, issuesNotes}}
  화면이 보낸 이번 주 자료만 보냄. 결과는 화면 입력칸에 채울 뿐 저장하지 않음 (사람이 고친 뒤 [저장])
"""
import json

from . import settings, audit
from .common import AuthError
from .logger import write_server_log

MODEL = "claude-opus-5-5"
MAX_INPUT_CHARS = 60000
LIMITS = {"currentWeekSummary": 3000, "nextWeekSummary": 3000, "issuesNotes": 2000}

SYSTEM = """당신은 IT 프로젝트 PMO 의 주간보고 작성을 돕는다.
입력은 한 주의 프로젝트 자료(JSON)다: 금주 실적 Task, 차주 계획 Task, 지연 · 위험, 회의 결정, 지난주 보고 요약.
세 칸의 초안을 한국어 보고서 문체(개조식, "~함" "~예정")로 쓴다.
- currentWeekSummary: 금주 중점 추진 실적 — 완료 · 진척이 큰 일 위주 3~6줄, 줄마다 "- " 로 시작
- nextWeekSummary: 차주 중점 추진 계획 — 3~6줄, "- " 로 시작
- issuesNotes: 주요 현안 · 리스크 · 지원 요청 — 지연 Task · 선행 지연 · 미결 결함 · 기한 지난 Action Item 중 중요한 것, 없으면 "특이사항 없음"
규칙: 입력에 없는 사실 · 숫자 · 날짜를 만들지 않는다. Task 는 ID 와 이름을 함께 쓴다. 각 칸은 1,500자 이내."""

SCHEMA = {
    "type": "object",
    "properties": {k: {"type": "string"} for k in LIMITS},
    "required": list(LIMITS),
    "additionalProperties": False,
}


def enabled():
    return settings.app_features(settings.APP_CONFIG)["features"].get("ai_draft", False)


def _client():
    try:
        import anthropic  # 선택 설치 — 기능을 켠 서버에만 필요
    except ImportError:
        raise AuthError("서버에 anthropic 패키지가 없습니다 — 서버 PC 에서 `pip install anthropic` 후 서버를 다시 시작하세요.", 503, "AI_NOT_INSTALLED")
    return anthropic, anthropic.Anthropic(timeout=120.0, max_retries=2)


def draft(payload):
    """자료(dict) → 세 칸 초안 dict. 실패하면 AuthError(화면에 보일 문구)"""
    anthropic, client = _client()
    body = json.dumps(payload, ensure_ascii=False)[:MAX_INPUT_CHARS]
    try:
        res = client.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": "이번 주 자료:\n" + body}],
        )
    except anthropic.AuthenticationError:
        raise AuthError("Claude API 키가 없거나 올바르지 않습니다 — 서버의 ANTHROPIC_API_KEY 를 확인하세요.", 503, "AI_KEY")
    except anthropic.RateLimitError:
        raise AuthError("AI 사용량 한도에 걸렸습니다 — 잠시 뒤 다시 시도하세요.", 429, "AI_RATE")
    except anthropic.APIConnectionError:
        raise AuthError("서버에서 Claude API(api.anthropic.com)에 연결할 수 없습니다 — 방화벽 · 프록시를 확인하세요.", 503, "AI_NETWORK")
    except anthropic.APIStatusError as e:
        write_server_log(f"[AI] API error {e.status_code}: {e.message}")
        raise AuthError(f"AI 요청이 실패했습니다 ({e.status_code}).", 502, "AI_ERROR")
    except TypeError as e:
        # 오래된 anthropic 패키지는 output_config 를 모름
        raise AuthError(f"서버의 anthropic 패키지가 오래되었습니다 — `pip install -U anthropic` ({e})", 503, "AI_NOT_INSTALLED")
    if res.stop_reason == "refusal":
        raise AuthError("AI 가 이 요청에 답하지 않았습니다 — 직접 작성해 주세요.", 422, "AI_REFUSED")
    if res.stop_reason == "max_tokens":
        raise AuthError("AI 답이 너무 길어 잘렸습니다 — 범위를 좁혀 다시 시도하세요.", 502, "AI_ERROR")
    text = next((b.text for b in res.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except ValueError:
        raise AuthError("AI 답을 읽지 못했습니다 — 다시 시도하세요.", 502, "AI_ERROR")
    return {k: str(data.get(k) or "").strip()[:n] for k, n in LIMITS.items()}


def api_weekly_draft(h, req):
    info = h._require_user(req=req)
    if not enabled():
        raise AuthError("AI 초안 기능이 꺼져 있습니다 (app.ini [features] ai_draft).", 403, "AI_OFF")
    data = req.get("data")
    if not isinstance(data, dict):
        raise AuthError("보낼 자료가 없습니다.", 400)
    out = draft(data)
    audit.by(h, info, "AI", "주간보고 초안", str(data.get("week") or "")[:100])
    h._send_json(200, {"ok": True, "draft": out, "model": MODEL})


ROUTES = {"/api/ai/weekly-draft": api_weekly_draft}
