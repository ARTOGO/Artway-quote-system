#!/usr/bin/env python3
"""Render a living progress dashboard from progress.json."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


STATUS_DEFAULT_PROGRESS = {
    "todo": 0,
    "ready": 10,
    "doing": 50,
    "review": 80,
    "testing": 90,
    "blocked": 0,
    "done": 80,
    "verified": 100,
    "released": 100,
}

STATUS_LABELS = {
    "todo": "待辦",
    "ready": "可開始",
    "doing": "進行中",
    "review": "審查中",
    "testing": "測試中",
    "blocked": "卡住",
    "done": "待驗證",
    "verified": "已驗證",
    "released": "已上線",
}

STATUS_ORDER = ["released", "verified", "testing", "review", "doing", "done", "blocked", "ready", "todo"]

STATUS_TONES = {
    "todo": "neutral",
    "ready": "neutral",
    "doing": "active",
    "review": "purple",
    "testing": "warning",
    "blocked": "danger",
    "done": "warning",
    "verified": "success",
    "released": "success",
}

EVIDENCE_LABELS = {
    "browser": "瀏覽器",
    "build": "建置",
    "curl": "請求",
    "http": "HTTP",
    "inspection": "檢查",
    "render": "產生",
    "screenshot": "截圖",
    "test": "測試",
    "web research": "線上研究",
}

WORKSTREAM_LABELS = {
    "product": "產品 / 範圍",
    "research": "研究",
    "design": "設計",
    "backend": "後端",
    "frontend": "前端 / UI",
    "qa": "QA / 驗證",
    "infra": "基礎設施",
    "release": "發布",
    "workflow": "代理工作流",
    "data": "資料模型",
    "docs": "文件",
}

WORKSTREAM_ORDER = [
    "product",
    "design",
    "data",
    "frontend",
    "workflow",
    "qa",
    "infra",
    "release",
    "docs",
]


def load_progress(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def clamp_percent(value: Any) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, round(number)))


def task_progress(task: dict[str, Any]) -> int:
    status = task.get("status", "todo")
    if status == "verified":
        return 100
    if "progress_percent" in task:
        return clamp_percent(task["progress_percent"])
    return STATUS_DEFAULT_PROGRESS.get(status, 0)


def weight_of(item: dict[str, Any]) -> float:
    try:
        weight = float(item.get("weight", 1))
    except (TypeError, ValueError):
        return 1
    return weight if weight > 0 else 1


def weighted_percent(items: list[dict[str, Any]], percent_key: str) -> int:
    if not items:
        return 0
    total_weight = sum(weight_of(item) for item in items)
    weighted = sum(weight_of(item) * item.get(percent_key, 0) for item in items)
    return round(weighted / total_weight)


def compute_summary(data: dict[str, Any]) -> dict[str, Any]:
    features = []
    status_counts = {status: 0 for status in STATUS_DEFAULT_PROGRESS}
    total_tasks = 0

    for feature in data.get("features", []):
        tasks = []
        for task in feature.get("tasks", []):
            status = task.get("status", "todo")
            total_tasks += 1
            status_counts[status] = status_counts.get(status, 0) + 1
            task_with_progress = dict(task)
            task_with_progress["progress_percent"] = task_progress(task)
            tasks.append(task_with_progress)

        feature_summary = dict(feature)
        feature_summary["tasks"] = tasks
        if tasks:
            feature_summary["progress_percent"] = weighted_percent(tasks, "progress_percent")
        else:
            feature_summary["progress_percent"] = STATUS_DEFAULT_PROGRESS.get(
                feature.get("status", "todo"), 0
            )
        features.append(feature_summary)

    overall_percent = weighted_percent(features, "progress_percent")
    return {
        "features": features,
        "overall_percent": overall_percent,
        "status_counts": status_counts,
        "total_tasks": total_tasks,
    }


def collect_integrity_warnings(data: dict[str, Any]) -> list[str]:
    warnings = []
    for feature in data.get("features", []):
        for task in feature.get("tasks", []):
            task_id = task.get("id", "(missing id)")
            status = task.get("status", "todo")
            if status not in STATUS_DEFAULT_PROGRESS:
                warnings.append(f"{task_id}: 未知狀態 '{status}'。")
            if status == "verified" and not task.get("evidence"):
                warnings.append(f"{task_id}: 已驗證任務必須包含驗證證據。")
            if "progress_percent" in task:
                try:
                    raw_percent = round(float(task["progress_percent"]))
                except (TypeError, ValueError):
                    warnings.append(f"{task_id}: progress_percent 不是數字。")
                    continue
                if clamp_percent(task["progress_percent"]) != raw_percent:
                    warnings.append(f"{task_id}: progress_percent 已被限制在 0-100。")
    return warnings


def html_list(items: list[Any], empty: str = "無") -> str:
    if not items:
        return f"<p class=\"muted\">{escape(empty)}</p>"
    return "<ul>" + "".join(f"<li>{escape(str(item))}</li>" for item in items) + "</ul>"


def render_progress_bar(percent: int) -> str:
    return (
        "<div class=\"bar\" aria-label=\"進度\">"
        f"<span style=\"width: {percent}%\"></span>"
        "</div>"
    )


def status_tone(status: str) -> str:
    return STATUS_TONES.get(status, "neutral")


def status_label(status: str) -> str:
    return STATUS_LABELS.get(status, status)


def render_pill(label: str, tone: str = "gray") -> str:
    return f'<span class="pill {escape(tone)}">{escape(label)}</span>'


def render_mini_track(percent: int, tone: str = "blue") -> str:
    return (
        '<div class="mini-track">'
        f'<div class="mini-fill {escape(tone)}" style="width: {clamp_percent(percent)}%;"></div>'
        "</div>"
    )


def flatten_tasks(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tasks = []
    for feature in features:
        for task in feature.get("tasks", []):
            item = dict(task)
            item["feature_id"] = feature.get("id", "")
            item["feature_title"] = feature.get("title", "")
            tasks.append(item)
    return tasks


def feature_lookup(features: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(feature.get("id", "")): feature for feature in features}


def normalize_goal_groups(data: dict[str, Any], features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups = data.get("goal_groups") or [
        {
            "id": "G1",
            "title": "最終目標",
            "summary": data.get("final_goal", ""),
            "kind": "primary",
            "feature_ids": [feature.get("id", "") for feature in features],
        }
    ]
    lookup = feature_lookup(features)
    normalized = []
    used_feature_ids = set()

    for group in groups:
        group_features = []
        for feature_id in group.get("feature_ids", []):
            feature = lookup.get(str(feature_id))
            if feature:
                group_features.append(feature)
                used_feature_ids.add(str(feature_id))
        group_with_features = dict(group)
        group_with_features["features"] = group_features
        group_with_features["progress_percent"] = weighted_percent(group_features, "progress_percent")
        normalized.append(group_with_features)

    orphan_features = [
        feature for feature in features if str(feature.get("id", "")) not in used_feature_ids
    ]
    if orphan_features:
        normalized.append(
            {
                "id": "G-unassigned",
                "title": "未歸類功能",
                "summary": "這些功能尚未連到最終目標或本輪附帶工作。",
                "kind": "side",
                "feature_ids": [feature.get("id", "") for feature in orphan_features],
                "features": orphan_features,
                "progress_percent": weighted_percent(orphan_features, "progress_percent"),
            }
        )
    return normalized


def primary_goal_percent(goal_groups: list[dict[str, Any]], fallback: int) -> int:
    primary = [group for group in goal_groups if group.get("kind") == "primary"]
    if primary:
        return weighted_percent(primary, "progress_percent")
    return fallback


def health_state(
    summary: dict[str, Any], warnings: list[str], blocked: list[Any], not_covered: list[Any]
) -> dict[str, str]:
    counts = summary["status_counts"]
    if blocked or counts.get("blocked", 0) or warnings:
        return {
            "label": "需處理",
            "tone": "danger",
            "detail": "目前有阻塞或資料完整性警告，應先排除再宣稱完成。",
        }
    if not_covered or counts.get("done", 0):
        return {
            "label": "需補驗證",
            "tone": "warning",
            "detail": "有完成但尚未驗證的工作，或仍有未覆蓋流程。",
        }
    if summary["overall_percent"] == 100:
        return {
            "label": "已驗證",
            "tone": "success",
            "detail": "所有追蹤工作都有完成證據。",
        }
    return {
        "label": "進行中",
        "tone": "active",
        "detail": "工作正在推進，下一步請看右側行動清單。",
    }


def next_actions(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = {"blocked": 0, "doing": 1, "done": 2, "todo": 3, "verified": 4}
    remaining = [task for task in tasks if task.get("status") != "verified"]
    return sorted(
        remaining,
        key=lambda task: (order.get(task.get("status", "todo"), 9), -task.get("progress_percent", 0)),
    )[:6]


def render_status_distribution(summary: dict[str, Any]) -> str:
    total = max(summary["total_tasks"], 1)
    rows = []
    for status in STATUS_ORDER:
        count = summary["status_counts"].get(status, 0)
        percent = round(count / total * 100)
        rows.append(
            f"""
<div class="status-row tone-{STATUS_TONES.get(status, 'neutral')}">
  <div class="status-row-label">
    <span>{escape(STATUS_LABELS.get(status, status))}</span>
    <strong>{count}</strong>
  </div>
  <div class="mini-bar"><span style="width: {percent}%"></span></div>
</div>
"""
        )
    return "".join(rows)


def render_feature_roadmap(features: list[dict[str, Any]]) -> str:
    if not features:
        return '<p class="muted">尚未定義功能。</p>'
    rows = []
    for index, feature in enumerate(features, start=1):
        tasks = feature.get("tasks", [])
        segments = []
        for task in tasks:
            width = round(weight_of(task) / sum(weight_of(item) for item in tasks) * 100) if tasks else 0
            status = escape(str(task.get("status", "todo")))
            segments.append(
                f'<span class="road-segment tone-{STATUS_TONES.get(status, "neutral")}" '
                f'style="width: {width}%" title="{escape(str(task.get("title", "")))}"></span>'
            )
        rows.append(
            f"""
<article class="roadmap-row">
  <div class="roadmap-meta">
    <span class="road-index">{index}</span>
    <div>
      <p class="eyebrow">{escape(str(feature.get("id", "")))}</p>
      <h3>{escape(str(feature.get("title", "未命名功能")))}</h3>
      <p>{escape(str(feature.get("summary", "")))}</p>
    </div>
  </div>
  <div class="roadmap-progress">
    <strong>{feature.get("progress_percent", 0)}%</strong>
    <div class="road-track">{''.join(segments) or '<span class="road-segment tone-neutral" style="width: 100%"></span>'}</div>
  </div>
</article>
"""
        )
    return "".join(rows)


def render_goal_map(goal_groups: list[dict[str, Any]]) -> str:
    if not goal_groups:
        return '<p class="muted">尚未定義目標地圖。</p>'
    blocks = []
    for group in goal_groups:
        kind = "最終目標" if group.get("kind") == "primary" else "本輪附帶工作"
        features = group.get("features", [])
        blocks.append(
            f"""
<section class="goal-group goal-{escape(str(group.get("kind", "side")))}">
  <div class="goal-group-head">
    <div>
      <p class="eyebrow">{escape(str(group.get("id", "")))} · {kind}</p>
      <h2>{escape(str(group.get("title", "未命名目標")))}</h2>
      <p>{escape(str(group.get("summary", "")))}</p>
    </div>
    <div class="goal-percent">
      <strong>{group.get("progress_percent", 0)}%</strong>
      <span>{kind}進度</span>
    </div>
  </div>
  {render_goal_outcomes(group, features)}
</section>
"""
        )
    return "".join(blocks)


def render_goal_completion_overview(goal_groups: list[dict[str, Any]]) -> str:
    if not goal_groups:
        return '<p class="muted">尚未定義目標完成邏輯。</p>'

    blocks = []
    for group in goal_groups:
        kind = "最終目標" if group.get("kind") == "primary" else "附帶工作"
        features = group.get("features", [])
        lookup = feature_lookup(features)
        outcomes = group.get("outcomes") or [
            {
                "id": f"{group.get('id', 'G')}-outcome",
                "title": group.get("title", "目標成功條件"),
                "description": group.get("summary", ""),
                "feature_ids": [feature.get("id", "") for feature in features],
            }
        ]
        outcome_items = []
        for outcome in outcomes:
            linked_features = [
                lookup[str(feature_id)]
                for feature_id in outcome.get("feature_ids", [])
                if str(feature_id) in lookup
            ]
            feature_labels = ", ".join(
                f"{feature.get('id', '')} {feature.get('title', '')}".strip()
                for feature in linked_features
            )
            outcome_percent = weighted_percent(linked_features, "progress_percent")
            outcome_items.append(
                f"""
<li>
  <div>
    <span>{escape(str(outcome.get("id", "")))}</span>
    <strong>{escape(str(outcome.get("title", "未命名成功條件")))}</strong>
    <em>{escape(feature_labels or "尚未連結功能")}</em>
  </div>
  <b>{outcome_percent}%</b>
</li>
"""
            )
        blocks.append(
            f"""
<article class="goal-summary goal-{escape(str(group.get("kind", "side")))}">
  <div class="goal-summary-head">
    <div>
      <p class="eyebrow">{escape(str(group.get("id", "")))} · {kind}</p>
      <h3>{escape(str(group.get("title", "未命名目標")))}</h3>
      <p>{escape(str(group.get("summary", "")))}</p>
    </div>
    <strong>{group.get("progress_percent", 0)}%</strong>
  </div>
  <ol class="outcome-list">{''.join(outcome_items)}</ol>
</article>
"""
        )
    return "".join(blocks)


def render_goal_outcomes(group: dict[str, Any], features: list[dict[str, Any]]) -> str:
    outcomes = group.get("outcomes") or [
        {
            "id": f"{group.get('id', 'G')}-outcome",
            "title": group.get("title", "目標成功條件"),
            "description": group.get("summary", ""),
            "feature_ids": [feature.get("id", "") for feature in features],
        }
    ]
    lookup = feature_lookup(features)
    outcome_blocks = []
    for outcome in outcomes:
        linked_features = [
            lookup[str(feature_id)]
            for feature_id in outcome.get("feature_ids", [])
            if str(feature_id) in lookup
        ]
        feature_blocks = "".join(
            render_goal_feature(feature, str(outcome.get("id", ""))) for feature in linked_features
        )
        outcome_blocks.append(
            f"""
<article class="goal-outcome">
  <div class="goal-outcome-head">
    <p class="eyebrow">{escape(str(outcome.get("id", "")))}</p>
    <h3>{escape(str(outcome.get("title", "未命名成功條件")))}</h3>
    <p>{escape(str(outcome.get("description", "")))}</p>
  </div>
  <div class="goal-feature-list">
    <h4>關聯功能</h4>
    {feature_blocks or '<p class="muted">尚未連結功能。</p>'}
  </div>
</article>
"""
        )
    return (
        '<div class="goal-outcomes"><h3>目標成功條件</h3>'
        + "".join(outcome_blocks)
        + "</div>"
    )


def render_goal_feature(feature: dict[str, Any], outcome_id: str) -> str:
    tasks = feature.get("tasks", [])
    task_chips = []
    for task in tasks:
        status = str(task.get("status", "todo"))
        task_chips.append(
            f"""
<li class="work-chip tone-{STATUS_TONES.get(status, 'neutral')}">
  <span>{escape(STATUS_LABELS.get(status, status))}</span>
  <strong>{escape(str(task.get("title", "未命名任務")))}</strong>
</li>
"""
        )
    contribution = feature_contribution(feature, outcome_id)
    return f"""
<article class="goal-feature">
  <div class="goal-feature-head">
    <div>
      <p class="eyebrow">{escape(str(feature.get("id", "")))}</p>
      <h3>{escape(str(feature.get("title", "未命名功能")))}</h3>
      <p>{escape(str(feature.get("summary", "")))}</p>
    </div>
    <strong>{feature.get("progress_percent", 0)}%</strong>
  </div>
  <div class="road-track" aria-label="功能進度">{render_goal_segments(tasks)}</div>
  <div class="feature-rationale">
    <div>
      <h4>為何必要</h4>
      <p>{escape(contribution.get("why", "尚未說明此功能與目標成功條件的關係。"))}</p>
    </div>
    <div>
      <h4>完成後證明</h4>
      <p>{escape(contribution.get("completion_signal", "尚未定義完成後如何證明目標被滿足。"))}</p>
    </div>
  </div>
  <div class="feature-work">
    <h4>功能要做的事</h4>
    <ul>{''.join(task_chips) or '<li class="muted">尚未定義任務。</li>'}</ul>
  </div>
</article>
"""


def feature_contribution(feature: dict[str, Any], outcome_id: str) -> dict[str, str]:
    contributions = feature.get("goal_contributions", [])
    for contribution in contributions:
        if str(contribution.get("outcome_id", "")) == outcome_id:
            return {
                "why": str(contribution.get("why", "")),
                "completion_signal": str(contribution.get("completion_signal", "")),
            }
    if contributions:
        first = contributions[0]
        return {
            "why": str(first.get("why", "")),
            "completion_signal": str(first.get("completion_signal", "")),
        }
    return {}


def render_goal_segments(tasks: list[dict[str, Any]]) -> str:
    if not tasks:
        return '<span class="road-segment tone-neutral" style="width: 100%"></span>'
    total_weight = sum(weight_of(item) for item in tasks)
    segments = []
    for task in tasks:
        width = round(weight_of(task) / total_weight * 100)
        status = str(task.get("status", "todo"))
        segments.append(
            f'<span class="road-segment tone-{STATUS_TONES.get(status, "neutral")}" '
            f'style="width: {width}%" title="{escape(str(task.get("title", "")))}"></span>'
        )
    return "".join(segments)


def render_next_actions(tasks: list[dict[str, Any]]) -> str:
    actions = next_actions(tasks)
    if not actions:
        return '<p class="muted">目前沒有待推進工作。</p>'
    rows = []
    for task in actions:
        status = str(task.get("status", "todo"))
        rows.append(
            f"""
<li class="action-item tone-{STATUS_TONES.get(status, 'neutral')}">
  <span>{escape(STATUS_LABELS.get(status, status))}</span>
  <strong>{escape(str(task.get("title", "未命名任務")))}</strong>
  <em>{escape(feature_task_ref(str(task.get("feature_id", "")), task))} · {task.get("progress_percent", 0)}%</em>
</li>
"""
        )
    return "<ol class=\"action-list\">" + "".join(rows) + "</ol>"


def render_evidence(task: dict[str, Any]) -> str:
    evidence = task.get("evidence", [])
    if not evidence:
        return "<p class=\"muted\">尚未記錄驗證證據。</p>"
    rows = []
    for item in evidence:
        if isinstance(item, dict):
            raw_label = str(item.get("type", "evidence"))
            label = escape(EVIDENCE_LABELS.get(raw_label, raw_label))
            ref = escape(str(item.get("ref", "")))
            result = escape(str(item.get("result", "")))
            rows.append(f"<li><strong>{label}</strong>: {ref} <span>{result}</span></li>")
        else:
            rows.append(f"<li>{escape(str(item))}</li>")
    return "<ul class=\"evidence\">" + "".join(rows) + "</ul>"


def render_task(task: dict[str, Any]) -> str:
    status = escape(str(task.get("status", "todo")))
    percent = task.get("progress_percent", task_progress(task))
    files = task.get("files", [])
    notes = task.get("notes", "")
    return f"""
<article class="task task-{status}">
  <div class="task-head">
    <div>
      <p class="eyebrow">{escape(task_ref(task))}</p>
      <h4>{escape(str(task.get("title", "未命名任務")))}</h4>
    </div>
    <span class="status">{escape(STATUS_LABELS.get(status, status))}</span>
  </div>
  <div class="task-progress">
    <span>{percent}%</span>
    {render_progress_bar(percent)}
  </div>
  <div class="task-grid">
    <section>
      <h5>修改檔案</h5>
      {html_list(files, "尚未連結檔案。")}
    </section>
    <section>
      <h5>驗證證據</h5>
      {render_evidence(task)}
    </section>
  </div>
  {f'<p class="notes">{escape(str(notes))}</p>' if notes else ''}
</article>
"""


def infer_workstream(task: dict[str, Any]) -> str:
    explicit = str(task.get("workstream", "")).strip().lower()
    if explicit:
        return explicit
    haystack = " ".join(
        [
            str(task.get("title", "")),
            str(task.get("notes", "")),
            " ".join(str(path) for path in task.get("files", [])),
        ]
    ).lower()
    if any(token in haystack for token in ["schema", "資料模型", "progress.json", "contract"]):
        return "data"
    if any(token in haystack for token in ["render", "html", "ui", "rwd", "介面", "視覺", "手機"]):
        return "frontend"
    if any(token in haystack for token in ["skill", "workflow", "claude", "codex", "agents", "規則"]):
        return "workflow"
    if any(token in haystack for token in ["test", "測試", "驗證", "browser", "curl", "qa"]):
        return "qa"
    if any(token in haystack for token in ["doc", "docs", "規格", "文件"]):
        return "docs"
    if any(token in haystack for token in ["research", "研究", "design", "figma"]):
        return "design"
    return "product"


def workstream_label(key: str) -> str:
    return WORKSTREAM_LABELS.get(key, key.replace("_", " ").title())


def group_tasks_by_workstream(tasks: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for task in tasks:
        groups.setdefault(infer_workstream(task), []).append(task)
    return groups


def ordered_workstream_keys(groups: dict[str, list[dict[str, Any]]]) -> list[str]:
    known = [key for key in WORKSTREAM_ORDER if key in groups]
    unknown = sorted(key for key in groups if key not in WORKSTREAM_ORDER)
    return known + unknown


def selected_feature(features: list[dict[str, Any]], current_focus: dict[str, Any]) -> dict[str, Any]:
    wanted = str(current_focus.get("feature_id", ""))
    for feature in features:
        if str(feature.get("id", "")) == wanted:
            return feature
    return features[0] if features else {"id": "", "title": "尚未定義功能", "summary": "", "tasks": [], "progress_percent": 0}


def selected_task(
    features: list[dict[str, Any]],
    selected: dict[str, Any],
    current_focus: dict[str, Any],
) -> dict[str, Any] | None:
    wanted = str(current_focus.get("task_id", ""))
    for task in selected.get("tasks", []):
        if str(task.get("id", "")) == wanted:
            return task
    for feature in features:
        for task in feature.get("tasks", []):
            if str(task.get("id", "")) == wanted:
                return task
    for task in selected.get("tasks", []):
        if task.get("status") != "verified":
            return task
    return selected.get("tasks", [None])[0] if selected.get("tasks") else None


def feature_data_id(feature: dict[str, Any], index: int) -> str:
    value = str(feature.get("id", "")).strip()
    return value or f"feature-{index + 1}"


def dom_token(value: str, fallback: str) -> str:
    token = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    while "--" in token:
        token = token.replace("--", "-")
    return token or fallback


def feature_ref(feature_or_id: dict[str, Any] | str) -> str:
    value = feature_or_id.get("id", "") if isinstance(feature_or_id, dict) else feature_or_id
    return f"功能 {str(value).strip() or '-'}"


def task_ref(task_or_id: dict[str, Any] | str) -> str:
    value = task_or_id.get("id", "") if isinstance(task_or_id, dict) else task_or_id
    return f"任務 {str(value).strip() or '-'}"


def feature_task_ref(feature_or_id: dict[str, Any] | str, task_or_id: dict[str, Any] | str) -> str:
    return f"{feature_ref(feature_or_id)} · {task_ref(task_or_id)}"


def feature_health(feature: dict[str, Any]) -> tuple[str, str]:
    tasks = feature.get("tasks", [])
    percent = clamp_percent(feature.get("progress_percent", 0))
    if any(task.get("status") == "blocked" for task in tasks):
        return "已阻塞", "danger"
    if percent == 100:
        return "正常", "success"
    if percent == 0:
        return "尚未開始", "neutral"
    return "有風險", "warning"


def render_feature_list(features: list[dict[str, Any]], selected_id: str) -> str:
    if not features:
        return '<p class="muted">尚未定義功能。</p>'
    rows = []
    for index, feature in enumerate(features):
        data_id = feature_data_id(feature, index)
        panel_id = f"feature-panel-{dom_token(data_id, f'feature-{index + 1}')}"
        active = " active" if str(feature.get("id", "")) == selected_id else ""
        pressed = "true" if active else "false"
        percent = feature.get("progress_percent", 0)
        tone = "green" if percent == 100 else "yellow" if percent else "gray"
        rows.append(
            f"""
<button class="feature-list-item{active}" type="button" data-feature-target="{escape(data_id)}" aria-controls="{escape(panel_id)}" aria-pressed="{pressed}">
  <div class="feature-list-top">
    <div>
      <div class="feature-list-title">{escape(feature_ref(feature))}：{escape(str(feature.get("title", "未命名功能")))}</div>
      <div class="feature-list-subtitle">{escape(str(feature.get("summary", "")))}</div>
    </div>
    {render_pill(f"{percent}%", tone)}
  </div>
  {render_mini_track(percent, tone)}
</button>
"""
        )
    return "".join(rows)


def render_feature_focus_card(feature: dict[str, Any], current_focus: dict[str, Any], is_active: bool) -> str:
    health_label, health_tone = feature_health(feature)
    focus_task = selected_task([feature], feature, current_focus if is_active else {})
    focus_task_id = focus_task.get("id", "-") if focus_task else "-"
    verified_count = sum(1 for task in feature.get("tasks", []) if task.get("status") == "verified")
    blocked_count = sum(1 for task in feature.get("tasks", []) if task.get("status") == "blocked")
    return f"""
<div class="feature-focus-card">
  <div>
    {render_pill(f'目前功能 · {health_label}', health_tone)}
    <h3>{escape(feature_ref(feature))}：{escape(str(feature.get("title", "未命名功能")))}</h3>
    <p>{escape(str(feature.get("summary", "這裡是功能的大圖：目標、範圍、進度、風險、依賴與驗證狀態先對齊。")))}</p>
  </div>
  <div class="feature-focus-meta">
    <div class="feature-focus-metric"><small>進度</small><strong>{feature.get("progress_percent", 0)}%</strong></div>
    <div class="feature-focus-metric"><small>任務</small><strong>{verified_count}/{len(feature.get("tasks", []))}</strong></div>
    <div class="feature-focus-metric"><small>阻塞</small><strong>{blocked_count}</strong></div>
    <div class="feature-focus-metric"><small>焦點</small><strong>{escape(task_ref(str(focus_task_id)))}</strong></div>
  </div>
</div>
"""


def render_scope_map(feature: dict[str, Any]) -> str:
    groups = group_tasks_by_workstream(feature.get("tasks", []))
    if not groups:
        return '<p class="muted">此功能尚未拆任務。</p>'
    columns = []
    for key in ordered_workstream_keys(groups):
        tasks = groups[key]
        done = sum(1 for task in tasks if task.get("status") == "verified")
        task_rows = []
        for task in tasks:
            status = str(task.get("status", "todo"))
            tone = status_tone(status)
            task_rows.append(
                f"""
<article class="scope-task">
  <strong>{escape(str(task.get("title", "未命名任務")))}</strong>
  <div class="task-meta">
    {render_pill(status_label(status), tone)}
    {render_pill(task_ref(task), "blue")}
  </div>
</article>
"""
            )
        columns.append(
            f"""
<section class="scope-column">
  <div class="scope-column-head">{escape(workstream_label(key))} {render_pill(f"{done}/{len(tasks)}", "green" if done == len(tasks) else "yellow" if done else "gray")}</div>
  {''.join(task_rows)}
</section>
"""
        )
    return '<div class="scope-map">' + "".join(columns) + "</div>"


def render_milestone_timeline(features: list[dict[str, Any]]) -> str:
    if not features:
        return '<p class="muted">尚未定義里程碑。</p>'
    rows = []
    for feature in features:
        percent = feature.get("progress_percent", 0)
        status = "verified" if percent == 100 else "doing" if percent else "todo"
        tone = status_tone(status)
        rows.append(
            f"""
<div class="milestone-row">
  <strong>{escape(str(feature.get("title", "未命名功能")))}</strong>
  {render_mini_track(percent, "green" if percent == 100 else "yellow" if percent else "gray")}
  <strong>{percent}%</strong>
  {render_pill(status_label(status), tone)}
</div>
"""
        )
    return '<div class="milestones">' + "".join(rows) + "</div>"


def render_kanban_panel(tasks: list[dict[str, Any]]) -> str:
    lanes = [
        ("可開始", ["ready", "todo"]),
        ("進行中", ["doing"]),
        ("審查中", ["review", "testing", "done"]),
        ("已阻塞", ["blocked"]),
        ("已完成", ["verified", "released"]),
    ]
    lane_html = []
    for title, statuses in lanes:
        lane_tasks = [task for task in tasks if task.get("status", "todo") in statuses]
        cards = []
        for task in lane_tasks:
            status = str(task.get("status", "todo"))
            cards.append(
                f"""
<article class="task-card">
  <strong>{escape(str(task.get("title", "未命名任務")))}</strong>
  <div class="task-meta">
    {render_pill(workstream_label(infer_workstream(task)), "purple")}
    {render_pill(status_label(status), status_tone(status))}
  </div>
</article>
"""
            )
        empty_class = " empty" if not lane_tasks else ""
        lane_html.append(
            f"""
<section class="mini-lane{empty_class}">
  <div class="mini-lane-title">{escape(title)} <span>{len(lane_tasks)}</span></div>
  {''.join(cards) or '<p class="muted small">無任務</p>'}
</section>
"""
        )
    return '<div class="compact-kanban">' + "".join(lane_html) + "</div>"


def render_workstream_panel(tasks: list[dict[str, Any]]) -> str:
    groups = group_tasks_by_workstream(tasks)
    if not groups:
        return '<p class="muted">尚未定義工作流。</p>'
    cards = []
    for key in ordered_workstream_keys(groups):
        stream_tasks = groups[key]
        for task in stream_tasks:
            task["progress_percent"] = task_progress(task)
        percent = weighted_percent(stream_tasks, "progress_percent")
        open_count = sum(1 for task in stream_tasks if task.get("status") != "verified")
        blocked_count = sum(1 for task in stream_tasks if task.get("status") == "blocked")
        tone = "green" if percent == 100 else "yellow" if percent else "gray"
        cards.append(
            f"""
<article class="management-card">
  <h4>{escape(workstream_label(key))}</h4>
  <div class="kpi-value small-value">{percent}%</div>
  {render_mini_track(percent, tone)}
  <div class="kpi-note">{open_count} 未完成 / {blocked_count} 已阻塞</div>
</article>
"""
        )
    return '<div class="load-grid">' + "".join(cards) + "</div>"


def render_timeline_panel(tasks: list[dict[str, Any]]) -> str:
    groups = group_tasks_by_workstream(tasks)
    if not groups:
        return '<p class="muted">尚未定義時程。</p>'
    rows = []
    for index, key in enumerate(ordered_workstream_keys(groups), start=1):
        bars = []
        for task_index, task in enumerate(groups[key], start=1):
            status = str(task.get("status", "todo"))
            start = min(6, index + task_index - 1)
            end = min(8, start + 2)
            bars.append(
                f"""
<div class="timeline-bar {escape(status_tone(status))}" style="grid-column: {start} / {end};">
  {escape(str(task.get("title", "未命名任務")))}
  <small>{escape(status_label(status))} · {task_progress(task)}%</small>
</div>
"""
            )
        rows.append(
            f"""
<div class="timeline-track">
  <div class="timeline-track-label">{escape(workstream_label(key))}<small>{len(groups[key])} 個任務</small></div>
  {''.join(bars)}
</div>
"""
        )
    return f"""
<div class="timeline-visual">
  <div class="timeline-ruler"><span></span><span>範圍</span><span>設計</span><span>實作</span><span>審查</span><span>QA</span><span>發布</span></div>
  <div class="timeline-board">{''.join(rows)}</div>
  <div class="timeline-now-row"><span></span><div class="timeline-now-line"></div></div>
</div>
"""


def render_risk_panel(risk_items: list[str], warnings: list[str]) -> str:
    if not risk_items and not warnings:
        return '<p class="muted">目前沒有阻塞、未覆蓋流程或資料完整性警告。</p>'
    rows = []
    for item in risk_items:
        rows.append(
            f"""
<tr>
  <td>{escape(item.split("：", 1)[0])}</td>
  <td>{escape(item.split("：", 1)[1] if "：" in item else item)}</td>
  <td>{render_pill("待處理", "yellow")}</td>
</tr>
"""
        )
    for warning in warnings:
        rows.append(
            f"""
<tr>
  <td>資料完整性</td>
  <td>{escape(warning)}</td>
  <td>{render_pill("需檢查", "red")}</td>
</tr>
"""
        )
    return f"""
<div class="table-wrap">
  <table class="risk-table">
    <thead><tr><th>類型</th><th>內容</th><th>狀態</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
</div>
"""


def render_blocker_diagnosis(feature: dict[str, Any], risk_items: list[str]) -> str:
    blocked_tasks = [task for task in feature.get("tasks", []) if task.get("status") == "blocked"]
    selected_blocker = blocked_tasks[0] if blocked_tasks else None
    if selected_blocker:
        node = f"{workstream_label(infer_workstream(selected_blocker))} · {selected_blocker.get('title', '未命名任務')}"
        reason = selected_blocker.get("blocker") or selected_blocker.get("notes") or (risk_items[0] if risk_items else "已標記 blocked，但尚未補具體原因。")
        impact = " → ".join(
            [
                str(selected_blocker.get("title", "已阻塞任務")),
                "下游任務",
                "驗證",
                "上線就緒",
            ]
        )
        status = render_pill("待處理", "red")
    else:
        node = "目前沒有已阻塞任務"
        reason = risk_items[0] if risk_items else "未偵測到需要診斷的 blocker。"
        impact = "無啟用中的影響鏈"
        status = render_pill("無阻塞", "green")

    checklist = [
        "補齊卡住原因與負責人",
        "確認受影響任務 / 工作流",
        "定義解除阻塞所需決策或行動",
        "解除後重新跑驗證並更新證據",
    ]
    checklist_html = "".join(
        f'<div class="unblock-item"><span class="unblock-num">{index}</span><span>{escape(item)}</span></div>'
        for index, item in enumerate(checklist, start=1)
    )
    return f"""
<section class="card blocker-diagnosis">
  <div class="card-title">
    <h3>阻塞診斷</h3>
    {status}
  </div>
  <div class="blocker-grid">
    <article class="blocker-card">
      <h4>目前阻塞節點</h4>
      <dl class="blocker-field-grid">
        <dt>節點</dt><dd>{escape(str(node))}</dd>
        <dt>卡住原因</dt><dd>{escape(str(reason))}</dd>
        <dt>受阻原因</dt><dd>{escape(str(reason))}</dd>
        <dt>負責人</dt><dd>待指定</dd>
        <dt>解除期限</dt><dd>待指定</dd>
      </dl>
    </article>
    <article class="blocker-card">
      <h4>影響鏈</h4>
      <div class="impact-chain">{escape(impact)}</div>
      <h4 style="margin-top: 14px;">解除阻塞清單</h4>
      <div class="unblock-list">{checklist_html}</div>
    </article>
  </div>
</section>
"""


def render_management_tabs(
    feature: dict[str, Any],
    goal_groups: list[dict[str, Any]],
    risk_items: list[str],
    warnings: list[str],
    tab_prefix: str = "view",
) -> str:
    tasks = feature.get("tasks", [])
    tab_ids = {
        "overview": f"{tab_prefix}-overview",
        "kanban": f"{tab_prefix}-kanban",
        "workstream": f"{tab_prefix}-workstream",
        "timeline": f"{tab_prefix}-timeline",
        "risk": f"{tab_prefix}-risk",
    }
    tab_name = f"{tab_prefix}-feature-view"
    return f"""
<section class="card">
  <div class="card-title">
    <h3>所選功能的管理視角</h3>
    {render_pill("同一範圍，多種視角", "blue")}
  </div>

  <div class="tab-system">
    <input type="radio" id="{escape(tab_ids["overview"])}" name="{escape(tab_name)}" data-tab="overview" checked>
    <input type="radio" id="{escape(tab_ids["kanban"])}" name="{escape(tab_name)}" data-tab="kanban">
    <input type="radio" id="{escape(tab_ids["workstream"])}" name="{escape(tab_name)}" data-tab="workstream">
    <input type="radio" id="{escape(tab_ids["timeline"])}" name="{escape(tab_name)}" data-tab="timeline">
    <input type="radio" id="{escape(tab_ids["risk"])}" name="{escape(tab_name)}" data-tab="risk">

    <div class="tab-labels">
      <label for="{escape(tab_ids["overview"])}" data-tab="overview">總覽地圖</label>
      <label for="{escape(tab_ids["kanban"])}" data-tab="kanban">看板</label>
      <label for="{escape(tab_ids["workstream"])}" data-tab="workstream">工作流</label>
      <label for="{escape(tab_ids["timeline"])}" data-tab="timeline">時程</label>
      <label for="{escape(tab_ids["risk"])}" data-tab="risk">風險 / 決策</label>
    </div>

    <div class="tab-panels">
      <div class="tab-panel overview-panel">
        <div class="management-grid">
          <article class="management-card"><h4>目標對齊</h4><div class="detail-value">{escape(str(feature.get("summary", "尚未記錄功能摘要。")))}</div></article>
          <article class="management-card"><h4>目前卡點</h4><div class="detail-value">{escape(risk_items[0] if risk_items else "目前沒有明確阻塞。")}</div></article>
          <article class="management-card"><h4>上線判斷</h4><div class="detail-value">必須等 P0 任務、驗收條件、驗證證據與未覆蓋清單都完成後，才可宣稱上線就緒。</div></article>
        </div>
        <div class="readiness-gate">
          <article class="gate-step"><strong>1. 範圍</strong>{render_pill("需檢查", "blue")}<small>目標與功能關係需可追溯。</small></article>
          <article class="gate-step"><strong>2. 實作</strong>{render_pill("進行中", "yellow")}<small>工作必須落到任務與驗證證據。</small></article>
          <article class="gate-step"><strong>3. 驗證</strong>{render_pill("必要", "purple")}<small>實作完成不等於已驗證，必須有證據。</small></article>
          <article class="gate-step"><strong>4. 風險</strong>{render_pill("待處理", "yellow")}<small>未覆蓋流程必須可見。</small></article>
          <article class="gate-step"><strong>5. 發布</strong>{render_pill("受阻", "gray")}<small>skill MVP 不做完整產品化後端。</small></article>
        </div>
      </div>
      <div class="tab-panel kanban-panel">{render_kanban_panel(tasks)}</div>
      <div class="tab-panel workstream-panel">{render_workstream_panel(tasks)}</div>
      <div class="tab-panel timeline-panel">{render_timeline_panel(tasks)}</div>
      <div class="tab-panel risk-panel">{render_risk_panel(risk_items, warnings)}</div>
    </div>
  </div>
</section>
"""


def render_task_detail_drawer(task: dict[str, Any] | None, feature: dict[str, Any]) -> str:
    if not task:
        return """
<aside class="card side-card">
  <div class="card-title drawer-card-title">
    <h3>任務細節抽屜</h3>
    <button type="button" class="drawer-close" data-drawer-close aria-label="收合任務細節">收合</button>
  </div>
  <p class="muted">尚未選取任務。</p>
</aside>
"""
    status = str(task.get("status", "todo"))
    percent = task_progress(task)
    checklist_items = task.get("checklist") or task.get("subtasks") or []
    checklist = "".join(
        f'<div class="check-item"><span class="box {"done" if item.get("status") in ("done", "verified") else ""}"></span><span>{escape(str(item.get("title", item)))}</span></div>'
        if isinstance(item, dict)
        else f'<div class="check-item"><span class="box"></span><span>{escape(str(item))}</span></div>'
        for item in checklist_items
    )
    progress_breakdown = task.get("progress_breakdown") or [
        {"label": "規格", "percent": 100 if percent >= 30 else percent},
        {"label": "實作", "percent": percent},
        {"label": "審查", "percent": min(percent, 80)},
        {"label": "測試", "percent": min(percent, 40)},
        {"label": "文件", "percent": min(percent, 20)},
    ]
    progress_rows = "".join(
        f"""
<div class="progress-detail-row">
  <strong>{escape(str(item.get("label", "Step")))}</strong>
  {render_mini_track(clamp_percent(item.get("percent", 0)), "green" if clamp_percent(item.get("percent", 0)) == 100 else "yellow" if clamp_percent(item.get("percent", 0)) else "gray")}
  <span>{clamp_percent(item.get("percent", 0))}%</span>
</div>
"""
        for item in progress_breakdown
        if isinstance(item, dict)
    )
    return f"""
<aside class="card side-card">
  <div class="card-title drawer-card-title">
    <h3>任務細節抽屜</h3>
    <div class="drawer-title-actions">
      {render_pill(status_label(status), status_tone(status))}
      <button type="button" class="drawer-close" data-drawer-close aria-label="收合任務細節">收合</button>
    </div>
  </div>
  <div class="detail-block-static">
    <div class="detail-label">{escape(feature_task_ref(feature, task))}</div>
    <div class="detail-value"><strong>{escape(str(task.get("title", "未命名任務")))}</strong></div>
  </div>
  <div class="progress-detail-row"><strong>進度</strong>{render_mini_track(percent, "green" if percent == 100 else "yellow" if percent else "gray")}<span>{percent}%</span></div>
  <div class="detail-block-static">
    <div class="detail-label">進度拆解</div>
    <div>{progress_rows}</div>
  </div>
  <div class="detail-block-static">
    <div class="detail-label">工作流</div>
    <div class="detail-value">{escape(workstream_label(infer_workstream(task)))}</div>
  </div>
  <div class="detail-block-static">
    <div class="detail-label">修改檔案</div>
    <div class="detail-value">{html_list(task.get("files", []), "尚未連結檔案。")}</div>
  </div>
  <div class="detail-block-static">
    <div class="detail-label">檢查清單 / 子任務</div>
    <div class="checklist">{checklist or '<p class="muted">尚未拆檢查清單。</p>'}</div>
  </div>
  <div class="detail-block-static">
    <div class="detail-label">驗證證據</div>
    <div class="detail-value">{render_evidence(task)}</div>
  </div>
  <div class="detail-block-static">
    <div class="detail-label">驗收條件 / 連結 / 最新更新</div>
    <div class="detail-value">{html_list(task.get("acceptance_criteria", []), "尚未記錄驗收條件。")}</div>
  </div>
</aside>
"""


def render_html(data: dict[str, Any]) -> str:
    summary = compute_summary(data)
    warnings = collect_integrity_warnings(data)
    generated_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    updated_at = data.get("updated_at", "未記錄")
    current_focus = data.get("current_focus", {})
    goal_groups = normalize_goal_groups(data, summary["features"])
    goal_percent = primary_goal_percent(goal_groups, summary["overall_percent"])
    all_tasks = flatten_tasks(summary["features"])
    health = health_state(
        {**summary, "overall_percent": goal_percent},
        warnings,
        data.get("blocked", []),
        data.get("not_covered", []),
    )
    verified_count = summary["status_counts"].get("verified", 0)
    remaining_count = summary["total_tasks"] - verified_count
    selected = selected_feature(summary["features"], current_focus)
    selected_id = str(selected.get("id", ""))
    detail_task = selected_task(summary["features"], selected, current_focus)
    blocker_count = summary["status_counts"].get("blocked", 0) + len(data.get("blocked", []))
    risk_level = {
        "danger": "高",
        "warning": "中",
        "active": "低",
        "success": "無",
    }.get(health["tone"], "中")

    risk_items = []
    risk_items.extend(f"阻塞：{item}" for item in data.get("blocked", []))
    risk_items.extend(f"未覆蓋：{item}" for item in data.get("not_covered", []))
    risk_items.extend(f"資料完整性：{item}" for item in warnings)
    risk_html = html_list(risk_items, "目前沒有阻塞、未覆蓋流程或資料完整性警告。")

    features_for_switch = summary["features"] or [selected]
    feature_focus_panels = []
    feature_scope_panels = []
    feature_management_panels = []
    feature_drawer_panels = []
    for index, feature in enumerate(features_for_switch):
        data_id = feature_data_id(feature, index)
        safe_id = dom_token(data_id, f"feature-{index + 1}")
        is_active = str(feature.get("id", "")) == selected_id or (not selected_id and index == 0)
        hidden = "" if is_active else " hidden"
        feature_task = selected_task([feature], feature, current_focus if is_active else {})
        feature_focus_panels.append(
            f"""
<div id="feature-panel-{escape(safe_id)}-focus" class="feature-focus-panel" data-feature-panel="{escape(data_id)}"{hidden}>
  {render_feature_focus_card(feature, current_focus, is_active)}
</div>
"""
        )
        feature_scope_panels.append(
            f"""
<div id="feature-panel-{escape(safe_id)}" class="feature-scope-panel" data-feature-panel="{escape(data_id)}"{hidden}>
  {render_scope_map(feature)}
</div>
"""
        )
        feature_management_panels.append(
            f"""
<div class="feature-panel" data-feature-panel="{escape(data_id)}"{hidden}>
  {render_management_tabs(feature, goal_groups, risk_items, warnings, f"feature-{safe_id}-view")}
  {render_blocker_diagnosis(feature, risk_items)}
</div>
"""
        )
        feature_drawer_panels.append(
            f"""
<div class="feature-drawer-panel" data-feature-panel="{escape(data_id)}"{hidden}>
  {render_task_detail_drawer(feature_task, feature)}
</div>
"""
        )

    feature_detail_blocks = []
    for feature in summary["features"]:
        percent = feature["progress_percent"]
        tasks = "\n".join(render_task(task) for task in feature.get("tasks", []))
        feature_detail_blocks.append(
            f"""
<details class="feature-detail">
  <summary>
    <span>{escape(feature_ref(feature))}</span>
    <strong>{escape(str(feature.get("title", "未命名功能")))}</strong>
    <em>{percent}%</em>
  </summary>
  <p class="detail-summary">{escape(str(feature.get("summary", "")))}</p>
  <div class="tasks">{tasks or '<p class="muted">尚未定義任務。</p>'}</div>
</details>
"""
        )

    conversation_changes = data.get("conversation_changes", [])
    change_rows = []
    for change in conversation_changes:
        change_rows.append(
            "<li>"
            f"<strong>{escape(str(change.get('at', '')))}</strong> "
            f"{escape(str(change.get('source', 'conversation')))}: "
            f"{escape(str(change.get('change', '')))}"
            f"<span>{escape(str(change.get('impact', '')))}</span>"
            "</li>"
        )

    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>{escape(str(data.get("project", "進度儀表板")))}</title>
  <style>
    :root {{
      --bg: #f6f7fb;
      --card: #ffffff;
      --text: #182033;
      --muted: #6b7280;
      --line: #e5e7eb;
      --primary: #2563eb;
      --primary-soft: #dbeafe;
      --green: #16a34a;
      --green-soft: #dcfce7;
      --yellow: #ca8a04;
      --yellow-soft: #fef3c7;
      --red: #dc2626;
      --red-soft: #fee2e2;
      --purple: #7c3aed;
      --purple-soft: #ede9fe;
      --shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
      --radius: 16px;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif;
      background: linear-gradient(180deg, #eef4ff 0, var(--bg) 280px);
      color: var(--text);
    }}
    .page {{ max-width: 1440px; margin: 0 auto; padding: 32px; }}
    h1, h2, h3, h4, h5, p {{ margin: 0; }}
    h1 {{ font-size: 34px; line-height: 1.15; letter-spacing: 0; }}
    h2 {{ font-size: 28px; line-height: 1.2; letter-spacing: 0; }}
    h3 {{ font-size: 17px; letter-spacing: 0; }}
    h4 {{ font-size: 14px; letter-spacing: 0; }}
    ul {{ margin: 8px 0 0; padding-left: 18px; }}
    li + li {{ margin-top: 6px; }}
    .muted {{ color: var(--muted); }}
    .small {{ font-size: 12px; }}
    .breadcrumbs, .eyebrow, .kpi-label, .detail-label {{ color: var(--muted); font-size: 12px; font-weight: 800; }}
    .topbar {{ display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 24px; }}
    .subtitle {{ margin-top: 8px; color: var(--muted); font-size: 15px; line-height: 1.6; max-width: 760px; }}
    .timestamp {{ color: var(--muted); font-size: 12px; text-align: right; line-height: 1.7; }}
    .hero {{ background: linear-gradient(135deg, #111827, #1e3a8a 62%, #2563eb); color: white; border-radius: 22px; padding: 28px; box-shadow: var(--shadow); margin-bottom: 24px; overflow: hidden; }}
    .hero-grid {{ display: grid; grid-template-columns: 1.4fr 0.8fr 0.8fr; gap: 22px; align-items: stretch; }}
    .hero p {{ color: rgba(255, 255, 255, 0.78); line-height: 1.7; font-size: 15px; }}
    .hero-card {{ background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 16px; padding: 18px; }}
    .label {{ font-size: 12px; color: rgba(255, 255, 255, 0.74); margin-bottom: 8px; }}
    .metric-large {{ font-size: 42px; font-weight: 900; margin-bottom: 8px; }}
    .progress-track, .mini-track {{ width: 100%; height: 10px; background: #eef2f7; border-radius: 999px; overflow: hidden; }}
    .progress-track {{ background: rgba(255, 255, 255, 0.18); }}
    .progress-bar, .mini-fill, .bar span {{ display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #93c5fd, #ffffff); }}
    .mini-fill.blue, .bar span {{ background: var(--primary); }}
    .mini-fill.green, .tone-success .mini-bar span, .tone-success.road-segment {{ background: var(--green); }}
    .mini-fill.yellow, .tone-warning .mini-bar span, .tone-warning.road-segment {{ background: var(--yellow); }}
    .mini-fill.gray, .tone-neutral .mini-bar span, .tone-neutral.road-segment {{ background: #cbd5e1; }}
    .tone-purple .mini-bar span, .tone-purple.road-segment {{ background: var(--purple); }}
    .tone-active .mini-bar span, .tone-active.road-segment {{ background: var(--primary); }}
    .tone-danger .mini-bar span, .tone-danger.road-segment {{ background: var(--red); }}
    .pill {{ display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 800; white-space: nowrap; }}
    .pill.green, .pill.success {{ background: var(--green-soft); color: var(--green); }}
    .pill.yellow, .pill.warning {{ background: var(--yellow-soft); color: var(--yellow); }}
    .pill.red, .pill.danger {{ background: var(--red-soft); color: var(--red); }}
    .pill.blue, .pill.active {{ background: var(--primary-soft); color: var(--primary); }}
    .pill.purple {{ background: var(--purple-soft); color: var(--purple); }}
    .pill.gray, .pill.neutral {{ background: #f3f4f6; color: #4b5563; }}
    .kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }}
    .card, .panel, .task, .feature-detail, .detail-block {{ background: var(--card); border: 1px solid rgba(226, 232, 240, 0.95); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; min-width: 0; }}
    .card-title {{ display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; min-width: 0; }}
    .kpi-value {{ font-size: 28px; font-weight: 900; margin-bottom: 8px; }}
    .small-value {{ font-size: 24px; }}
    .kpi-note {{ color: var(--muted); font-size: 13px; line-height: 1.5; }}
    .main-grid {{ display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; align-items: start; }}
    .main-grid > * {{ min-width: 0; }}
    .section-stack {{ display: grid; gap: 22px; min-width: 0; }}
    .milestones {{ display: grid; gap: 14px; min-width: 0; }}
    .milestone-row {{ display: grid; grid-template-columns: minmax(110px, 180px) 1fr 70px 92px; align-items: center; gap: 12px; font-size: 14px; }}
    .milestone-row > * {{ min-width: 0; }}
    .feature-hub {{ display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; align-items: stretch; min-width: 0; }}
    .feature-focus-card {{ border-radius: 18px; padding: 20px; background: linear-gradient(135deg, #0f172a, #1d4ed8); color: #fff; min-height: 260px; display: flex; flex-direction: column; justify-content: space-between; }}
    .feature-focus-card h3 {{ margin: 14px 0 8px; font-size: 25px; }}
    .feature-focus-card p {{ color: rgba(255,255,255,.76); line-height: 1.7; font-size: 14px; }}
    .feature-focus-meta {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }}
    .feature-focus-metric {{ background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.18); border-radius: 12px; padding: 12px; }}
    .feature-focus-metric small {{ display: block; color: rgba(255,255,255,.68); margin-bottom: 6px; font-weight: 800; font-size: 11px; }}
    .feature-focus-metric strong {{ font-size: 20px; }}
    .feature-list {{ display: grid; gap: 12px; }}
    .feature-list-item {{ width: 100%; border: 1px solid #e2e8f0; background: #f8fafc; color: inherit; border-radius: 14px; padding: 14px; text-align: left; font: inherit; cursor: pointer; }}
    .feature-list-item.active {{ border-color: #bfdbfe; background: #eff6ff; }}
    .feature-list-item:hover, .feature-list-item:focus-visible {{ border-color: #93c5fd; outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); }}
    .feature-list-top {{ display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 10px; }}
    .feature-list-title {{ font-weight: 950; font-size: 14px; line-height: 1.4; }}
    .feature-list-subtitle {{ color: var(--muted); font-size: 12px; line-height: 1.5; margin-top: 3px; }}
    .code-legend {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: -4px 0 16px; color: var(--muted); font-size: 13px; line-height: 1.5; }}
    .code-legend strong {{ color: var(--text); }}
    .feature-focus-panels, .feature-scope-panels, .feature-management-panels, .feature-panel, .feature-focus-panel, .feature-scope-panel, .feature-drawer-panel {{ min-width: 0; }}
    .drawer-toggle {{ position: fixed; right: 24px; bottom: 24px; z-index: 60; border: 0; border-radius: 999px; background: var(--text); color: #fff; padding: 12px 16px; font: inherit; font-size: 13px; font-weight: 900; box-shadow: 0 14px 30px rgba(15, 23, 42, .22); cursor: pointer; }}
    .drawer-toggle:hover, .drawer-toggle:focus-visible {{ background: #0f172a; outline: none; box-shadow: 0 0 0 4px rgba(37, 99, 235, .16), 0 14px 30px rgba(15, 23, 42, .22); }}
    .drawer-backdrop {{ position: fixed; inset: 0; z-index: 45; background: rgba(15, 23, 42, .26); opacity: 0; pointer-events: none; transition: opacity .18s ease; }}
    .feature-drawer-panels {{ position: fixed; top: 24px; right: 24px; z-index: 50; width: min(420px, calc(100vw - 32px)); max-height: calc(100svh - 48px); min-width: 0; transform: translateX(calc(100% + 32px)); opacity: 0; pointer-events: none; transition: transform .22s ease, opacity .18s ease; }}
    .main-grid.drawer-open .feature-drawer-panels {{ transform: translateX(0); opacity: 1; pointer-events: auto; }}
    .main-grid.drawer-open .drawer-backdrop {{ opacity: 1; pointer-events: auto; }}
    [hidden] {{ display: none !important; }}
    .scope-map {{ display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 14px; margin-top: 16px; min-width: 0; }}
    .scope-column {{ border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 16px; padding: 14px; min-height: 220px; }}
    .scope-column-head {{ display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: 950; font-size: 14px; }}
    .scope-task, .task-card, .task-row {{ background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-bottom: 10px; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.035); }}
    .scope-task strong, .task-card strong {{ display: block; font-size: 13px; line-height: 1.45; margin-bottom: 8px; }}
    .task-meta {{ display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }}
    .tab-system > input {{ display: none; }}
    .tab-labels {{ display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }}
    .tab-labels label {{ border: 1px solid var(--line); background: #fff; color: var(--muted); border-radius: 999px; padding: 9px 13px; font-size: 13px; font-weight: 900; cursor: pointer; }}
    .tab-system:has(input[data-tab="overview"]:checked) .tab-labels label[data-tab="overview"], .tab-system:has(input[data-tab="kanban"]:checked) .tab-labels label[data-tab="kanban"], .tab-system:has(input[data-tab="workstream"]:checked) .tab-labels label[data-tab="workstream"], .tab-system:has(input[data-tab="timeline"]:checked) .tab-labels label[data-tab="timeline"], .tab-system:has(input[data-tab="risk"]:checked) .tab-labels label[data-tab="risk"] {{ background: var(--text); color: #fff; border-color: var(--text); }}
    .tab-panel {{ display: none; }}
    .tab-system:has(input[data-tab="overview"]:checked) .overview-panel, .tab-system:has(input[data-tab="kanban"]:checked) .kanban-panel, .tab-system:has(input[data-tab="workstream"]:checked) .workstream-panel, .tab-system:has(input[data-tab="timeline"]:checked) .timeline-panel, .tab-system:has(input[data-tab="risk"]:checked) .risk-panel {{ display: block; }}
    .management-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; min-width: 0; }}
    .management-card, .gate-step {{ border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 14px; padding: 15px; }}
    .management-card h4, .gate-step strong {{ display: block; margin-bottom: 10px; }}
    .detail-value {{ font-size: 14px; line-height: 1.65; }}
    .readiness-gate {{ display: grid; grid-template-columns: repeat(5, minmax(130px, 1fr)); gap: 10px; margin-top: 14px; overflow-x: auto; }}
    .gate-step small {{ display: block; color: var(--muted); line-height: 1.5; margin-top: 8px; }}
    .compact-kanban {{ align-items: start; display: grid; grid-template-columns: repeat(5, minmax(160px, 1fr)); gap: 12px; overflow-x: auto; min-width: 0; }}
    .load-grid {{ display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 12px; overflow-x: auto; min-width: 0; }}
    .mini-lane {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 10px; min-height: 0; align-self: start; }}
    .mini-lane.empty {{ padding-bottom: 10px; }}
    .mini-lane-title {{ color: var(--muted); font-size: 12px; font-weight: 900; margin-bottom: 9px; display: flex; justify-content: space-between; }}
    .timeline-ruler, .timeline-track, .timeline-now-row {{ display: grid; grid-template-columns: 120px repeat(6, minmax(96px, 1fr)); gap: 8px; align-items: stretch; min-width: 720px; }}
    .timeline-ruler {{ color: var(--muted); font-size: 12px; font-weight: 900; margin-bottom: 10px; }}
    .timeline-visual, .tab-system, .tab-panels {{ min-width: 0; }}
    .timeline-board {{ display: grid; gap: 10px; overflow-x: auto; min-width: 0; }}
    .timeline-track-label {{ display: flex; flex-direction: column; justify-content: center; gap: 4px; font-weight: 950; font-size: 13px; line-height: 1.35; }}
    .timeline-track-label small {{ color: var(--muted); font-size: 11px; font-weight: 800; }}
    .timeline-bar {{ border-radius: 12px; padding: 11px 12px; min-height: 58px; display: flex; flex-direction: column; justify-content: center; font-size: 12px; font-weight: 900; }}
    .timeline-bar.success {{ background: var(--green-soft); color: var(--green); }}
    .timeline-bar.active {{ background: var(--primary-soft); color: var(--primary); }}
    .timeline-bar.warning {{ background: var(--yellow-soft); color: var(--yellow); }}
    .timeline-bar.danger {{ background: var(--red-soft); color: var(--red); }}
    .timeline-bar.neutral {{ background: #f1f5f9; color: #475569; }}
    .timeline-now-line {{ grid-column: 4 / 5; border-left: 3px solid var(--red); height: 30px; margin-left: 50%; position: relative; }}
    .timeline-now-line::after {{ content: "今日"; position: absolute; top: -20px; left: -20px; background: var(--red); color: #fff; border-radius: 999px; font-size: 10px; font-weight: 900; padding: 3px 7px; }}
    .blocker-diagnosis {{ border-color: #fecaca; background: linear-gradient(180deg, #fff7f7, #ffffff); }}
    .blocker-grid {{ display: grid; grid-template-columns: 1.05fr .95fr; gap: 14px; }}
    .blocker-card {{ background: #fff; border: 1px solid #fee2e2; border-radius: 14px; padding: 14px; }}
    .blocker-field-grid {{ display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; font-size: 13px; line-height: 1.5; }}
    .blocker-field-grid dt {{ color: var(--muted); font-weight: 900; }}
    .blocker-field-grid dd {{ margin: 0; font-weight: 650; }}
    .impact-chain {{ color: var(--muted); font-size: 13px; line-height: 1.7; }}
    .unblock-list {{ display: grid; gap: 9px; margin-top: 8px; font-size: 13px; line-height: 1.5; }}
    .unblock-item {{ display: flex; gap: 9px; align-items: flex-start; }}
    .unblock-num {{ display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--red-soft); color: var(--red); font-size: 11px; font-weight: 950; flex: 0 0 22px; }}
    .side-card {{ align-self: start; min-width: 0; max-height: calc(100svh - 48px); overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; -webkit-overflow-scrolling: touch; }}
    .drawer-card-title {{ position: sticky; top: -20px; z-index: 1; background: var(--card); padding-top: 2px; }}
    .drawer-title-actions {{ display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }}
    .drawer-close {{ border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--text); padding: 6px 10px; font: inherit; font-size: 12px; font-weight: 900; cursor: pointer; }}
    .drawer-close:hover, .drawer-close:focus-visible {{ border-color: #93c5fd; outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); }}
    .detail-block-static {{ border-bottom: 1px solid #eef2f7; padding: 14px 0; }}
    .detail-block-static:first-of-type {{ padding-top: 0; }}
    .progress-detail-row {{ display: grid; grid-template-columns: 86px 1fr 44px; align-items: center; gap: 10px; font-size: 13px; padding: 12px 0; }}
    .checklist {{ display: grid; gap: 10px; margin-top: 10px; }}
    .check-item {{ display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.5; }}
    .box {{ width: 18px; height: 18px; border-radius: 5px; border: 2px solid #cbd5e1; flex: 0 0 18px; margin-top: 1px; }}
    .box.done {{ background: var(--green); border-color: var(--green); }}
    .table-wrap {{ overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th {{ color: var(--muted); text-align: left; font-size: 12px; padding: 12px 10px; border-bottom: 1px solid var(--line); font-weight: 800; }}
    td {{ padding: 14px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }}
    .status-row + .status-row {{ margin-top: 10px; }}
    .status-row-label {{ display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }}
    .mini-bar {{ height: 8px; border-radius: 999px; background: #eef2f7; overflow: hidden; }}
    .mini-bar span {{ display: block; height: 100%; }}
    .goal-summary-grid, .goal-map {{ display: grid; gap: 12px; }}
    .goal-summary, .goal-group, .goal-feature, .goal-outcome {{ border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; background: #f8fafc; }}
    .goal-summary-head, .goal-group-head, .goal-feature-head {{ display: grid; grid-template-columns: minmax(0, 1fr) 80px; gap: 12px; align-items: start; }}
    .outcome-list {{ list-style: none; padding: 0; display: grid; gap: 8px; }}
    .outcome-list li {{ display: grid; grid-template-columns: minmax(0, 1fr) 52px; gap: 10px; border-top: 1px solid var(--line); padding-top: 8px; }}
    .goal-outcomes, .goal-feature-list, .feature-rationale, .feature-work {{ margin-top: 12px; }}
    .feature-rationale {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
    .feature-rationale div, .work-chip {{ border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: #fff; }}
    .feature-work ul {{ list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }}
    .road-track {{ height: 12px; display: flex; overflow: hidden; border-radius: 999px; background: #eef2f7; margin-top: 12px; }}
    .road-segment + .road-segment {{ border-left: 2px solid #fff; }}
    .detail-stack {{ display: grid; gap: 12px; margin-top: 22px; }}
    .detail-block summary {{ cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; }}
    .detail-block summary strong {{ display: block; }}
    .detail-block summary span {{ color: var(--muted); font-size: 13px; }}
    .detail-body {{ margin-top: 14px; }}
    .feature-detail {{ box-shadow: none; }}
    .feature-detail + .feature-detail {{ margin-top: 10px; }}
    .feature-detail summary {{ cursor: pointer; display: grid; grid-template-columns: 72px minmax(0, 1fr) 64px; gap: 10px; align-items: center; }}
    .feature-detail summary span, .feature-detail summary em {{ color: var(--muted); font-style: normal; }}
    .detail-summary, .notes, .evidence span, .change-log span {{ color: var(--muted); }}
    .tasks {{ margin-top: 14px; display: grid; gap: 10px; }}
    .task {{ box-shadow: none; padding: 14px; }}
    .task-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }}
    .task-progress {{ display: grid; grid-template-columns: 56px 1fr; gap: 10px; align-items: center; margin-top: 12px; }}
    .task-head {{ display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }}
    .status {{ border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; font-size: 12px; white-space: nowrap; }}
    .change-log {{ max-height: 280px; overflow: auto; }}
    .bar {{ height: 10px; overflow: hidden; background: #e7ecef; border-radius: 999px; }}
    @media (max-width: 1280px) {{
      .main-grid {{ grid-template-columns: 1fr; }}
    }}
    @media (max-width: 1100px) {{
      .feature-hub, .scope-map, .management-grid, .load-grid, .hero-grid, .kpi-grid, .blocker-grid {{ grid-template-columns: 1fr; }}
      .feature-focus-meta {{ grid-template-columns: repeat(2, 1fr); }}
    }}
    @media (max-width: 760px) {{
      .page {{ padding: 18px; }}
      .topbar {{ flex-direction: column; }}
      .timestamp {{ text-align: left; }}
      .milestone-row, .task-grid, .feature-rationale, .goal-summary-head, .goal-group-head, .goal-feature-head, .outcome-list li, .detail-block summary {{ grid-template-columns: 1fr; }}
      .timeline-ruler, .timeline-track, .timeline-now-row {{ min-width: 720px; }}
      .feature-drawer-panels {{ top: 12px; right: 12px; width: calc(100vw - 24px); max-height: calc(100svh - 24px); }}
      .drawer-toggle {{ right: 16px; bottom: 16px; }}
      .side-card {{ max-height: 72svh; }}
      h1 {{ font-size: 28px; }}
    }}
    @media (max-width: 520px) {{
      .page {{ padding: 12px; }}
      h1 {{ font-size: 25px; }}
      .hero, .card, .panel, .task, .feature-detail, .goal-group, .detail-block, .goal-summary {{ padding: 14px; }}
      .metric-large {{ font-size: 34px; }}
      .feature-focus-meta, .readiness-gate {{ grid-template-columns: 1fr; }}
      .feature-detail summary {{ grid-template-columns: 1fr; }}
      .task-head {{ display: block; }}
      .status {{ display: inline-block; margin-top: 8px; }}
      .feature-work ul {{ display: grid; }}
    }}
  </style>
</head>
<body>
  <main class="page">
    <header class="topbar">
      <div>
        <div class="breadcrumbs">產品 / 功能交付 / 儀表板模板</div>
        <h1>功能進度儀表板</h1>
        <div class="subtitle">{escape(str(data.get("project", "進度儀表板")))}：{escape(str(data.get("final_goal", "尚未記錄最終目標。")))}</div>
      </div>
      <div class="timestamp">
        <p>資料更新：{escape(str(updated_at))}</p>
        <p>HTML 產生：{escape(generated_at)}</p>
      </div>
    </header>

    <section class="hero" aria-label="全局總覽">
      <div class="hero-grid">
        <div>
          {render_pill(health["label"], health["tone"])}
          <h2 style="margin-top: 16px;">{escape(str(selected.get("title", "尚未定義功能")))}</h2>
          <p>{escape(str(selected.get("summary", data.get("final_goal", ""))))}</p>
        </div>
        <div class="hero-card">
          <div class="label">整體進度</div>
          <div class="metric-large">{goal_percent}%</div>
          <div class="progress-track"><div class="progress-bar" style="width: {goal_percent}%;"></div></div>
        </div>
        <div class="hero-card">
          <div class="label">目前焦點</div>
          <div style="font-size: 22px; font-weight: 900; margin-bottom: 10px;">{escape(feature_task_ref(str(current_focus.get("feature_id", selected_id) or "-"), str(current_focus.get("task_id", "-"))))}</div>
          <p>{escape(str(current_focus.get("summary", "尚未記錄目前焦點。")))}</p>
        </div>
      </div>
    </section>

    <section class="kpi-grid">
      <article class="card">
        <div class="kpi-label">範圍完成</div>
        <div class="kpi-value">{verified_count} / {summary["total_tasks"]}</div>
        <div class="kpi-note">已驗證任務才算真正完成；只有完成實作仍需補驗證證據。</div>
      </article>
      <article class="card">
        <div class="kpi-label">目前階段</div>
        <div class="kpi-value">{escape(status_label(str(detail_task.get("status", "todo") if detail_task else "todo")))}</div>
        <div class="kpi-note">{escape(str(detail_task.get("title", "尚未選取任務") if detail_task else "尚未選取任務"))}</div>
      </article>
      <article class="card">
        <div class="kpi-label">阻塞項目</div>
        <div class="kpi-value">{blocker_count}</div>
        <div class="kpi-note">包含 blocked 任務與明確阻塞清單；enum 保留原文。</div>
      </article>
      <article class="card">
        <div class="kpi-label">風險等級</div>
        <div class="kpi-value">{escape(risk_level)}</div>
        <div class="kpi-note">{escape(health["detail"])}</div>
      </article>
    </section>

    <section class="main-grid" data-feature-switcher data-task-drawer>
      <div class="section-stack">
        <section class="card">
          <div class="card-title">
            <h3>里程碑時程</h3>
            {render_pill(f'{len(summary["features"])} 個功能', "blue")}
          </div>
          {render_milestone_timeline(summary["features"])}
        </section>

        <section class="card">
          <div class="card-title">
            <h3>按功能拆解範圍</h3>
            {render_pill("單一資料來源", "purple")}
          </div>
          <div class="code-legend">
            <strong>代號說明</strong>
            <span>功能 F4 = 第 4 個功能；任務 T4.1 = 功能 F4 底下第 1 個任務。</span>
          </div>
          <div class="feature-hub">
            <div class="feature-focus-panels">{''.join(feature_focus_panels)}</div>
            <div class="feature-list">{render_feature_list(summary["features"], selected_id)}</div>
          </div>
          <div class="feature-scope-panels">{''.join(feature_scope_panels)}</div>
        </section>

        <div class="feature-management-panels">{''.join(feature_management_panels)}</div>

        <section class="card">
          <div class="card-title">
            <h3>功能總覽 · 目標完成邏輯</h3>
            {render_pill("總覽地圖", "blue")}
          </div>
          <p class="muted" style="margin-bottom: 14px;">先看每個目標成功條件由哪些功能支撐；完整原因、完成證明與任務證據放在下方展開區。</p>
          <div class="goal-summary-grid">{render_goal_completion_overview(goal_groups)}</div>
        </section>

        <section class="card">
          <div class="card-title">
            <h3>狀態分布與下一步</h3>
            {render_pill("全局總覽", "blue")}
          </div>
          <div class="management-grid">
            <div>{render_status_distribution(summary)}</div>
            <div><h4>下一步</h4>{render_next_actions(all_tasks)}</div>
            <div><h4>風險 / 缺口</h4>{risk_html}</div>
          </div>
        </section>
      </div>

      <button type="button" class="drawer-toggle" data-drawer-toggle aria-expanded="false" aria-controls="task-detail-drawer">顯示任務細節</button>
      <div class="drawer-backdrop" data-drawer-close aria-hidden="true"></div>
      <div id="task-detail-drawer" class="feature-drawer-panels" aria-hidden="true">{''.join(feature_drawer_panels)}</div>
    </section>

    <div class="detail-stack">
      <details class="detail-block">
        <summary>
          <div>
            <strong>展開目標與功能關聯</strong>
            <span>查看成功條件、關聯功能、為何必要、完成後證明與功能要做的事。</span>
          </div>
          <span>目標內功能</span>
        </summary>
        <div class="detail-body">
          <h2>目標地圖</h2>
          <p class="muted">結構：最終目標 -> 目標內功能 -> 功能要做的事。附帶工作獨立成組，不灌入核心目標進度。</p>
          <div class="goal-map">{render_goal_map(goal_groups)}</div>
        </div>
      </details>

      <details class="detail-block">
        <summary>
          <div>
            <strong>展開成功條件</strong>
            <span>查看本任務宣稱完成前必須滿足的條件。</span>
          </div>
          <span>{len(data.get("success_criteria", []))} 項</span>
        </summary>
        <div class="detail-body">
          {html_list(data.get("success_criteria", []), "尚未記錄成功條件。")}
        </div>
      </details>

      <details class="detail-block">
        <summary>
          <div>
            <strong>展開任務明細</strong>
            <span>查看每個功能底下的任務、修改檔案與驗證證據。</span>
          </div>
          <span>{summary["total_tasks"]} 個任務</span>
        </summary>
        <div class="detail-body">
          {''.join(feature_detail_blocks) or '<p class="muted">尚未定義功能。</p>'}
        </div>
      </details>

      <details class="detail-block">
        <summary>
          <div>
            <strong>展開變更紀錄</strong>
            <span>查看對話中造成範圍、需求或驗證狀態改變的紀錄。</span>
          </div>
          <span>{len(conversation_changes)} 筆</span>
        </summary>
        <div class="detail-body">
          <ul class="change-log">{''.join(change_rows) or '<li class="muted">尚未記錄對話變更。</li>'}</ul>
        </div>
      </details>
    </div>
  </main>
  <script>
    (() => {{
      function activateFeature(root, featureId) {{
        root.querySelectorAll("[data-feature-target]").forEach((button) => {{
          const active = button.dataset.featureTarget === featureId;
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        }});
        root.querySelectorAll("[data-feature-panel]").forEach((panel) => {{
          panel.hidden = panel.dataset.featurePanel !== featureId;
        }});
      }}

      function setDrawerOpen(root, open) {{
        root.classList.toggle("drawer-open", open);
        const toggle = root.querySelector("[data-drawer-toggle]");
        const drawer = root.querySelector("#task-detail-drawer");
        if (toggle) {{
          toggle.setAttribute("aria-expanded", open ? "true" : "false");
          toggle.textContent = open ? "收合任務細節" : "顯示任務細節";
        }}
        if (drawer) {{
          drawer.setAttribute("aria-hidden", open ? "false" : "true");
        }}
      }}

      document.querySelectorAll("[data-feature-switcher]").forEach((root) => {{
        const buttons = Array.from(root.querySelectorAll("[data-feature-target]"));
        buttons.forEach((button) => {{
          button.addEventListener("click", () => activateFeature(root, button.dataset.featureTarget));
        }});
        const initial = buttons.find((button) => button.classList.contains("active")) || buttons[0];
        if (initial) activateFeature(root, initial.dataset.featureTarget);

        const drawerToggle = root.querySelector("[data-drawer-toggle]");
        if (drawerToggle) {{
          drawerToggle.addEventListener("click", () => setDrawerOpen(root, !root.classList.contains("drawer-open")));
        }}
        root.querySelectorAll("[data-drawer-close]").forEach((closeTarget) => {{
          closeTarget.addEventListener("click", () => setDrawerOpen(root, false));
        }});
        setDrawerOpen(root, false);
      }});

      document.addEventListener("keydown", (event) => {{
        if (event.key !== "Escape") return;
        document.querySelectorAll("[data-task-drawer]").forEach((root) => setDrawerOpen(root, false));
      }});
    }})();
  </script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render progress.html from progress.json")
    parser.add_argument("source", help="Path to progress.json")
    parser.add_argument("target", help="Path to write progress.html")
    args = parser.parse_args(argv)

    source = Path(args.source)
    target = Path(args.target)
    data = load_progress(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render_html(data), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
