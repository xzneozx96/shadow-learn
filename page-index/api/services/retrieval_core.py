"""Shared single-document retrieval reasoning.

Used by both the async retrieval Celery task and the synchronous multi-document
search service so the node-selection logic lives in exactly one place.
"""

import json
import logging

import litellm
from pageindex.retrieve import get_page_content
from api.config import settings

logger = logging.getLogger(__name__)


def clean_structure_for_prompt(nodes: list) -> list:
    """Strip large text/child fields so the tree fits cheaply in a prompt."""
    cleaned = []
    for node in nodes:
        node_copy = {k: v for k, v in node.items() if k not in ("text", "nodes")}
        if "nodes" in node:
            node_copy["nodes"] = clean_structure_for_prompt(node["nodes"])
        cleaned.append(node_copy)
    return cleaned


def extract_node_content(nodes: list, target_ids: list, doc_info: dict = None) -> list:
    """Recursively collect content for the nodes whose ids the LLM chose.

    Content comes from the node's own ``text`` if present; otherwise from the
    document's pages via the core retriever (cached ``pages`` first, PDF fallback).
    """
    results = []
    documents = {doc_info["id"]: doc_info} if doc_info and doc_info.get("id") else None

    def page_text(node) -> str:
        if not documents or "start_index" not in node or "end_index" not in node:
            return ""
        doc_id = next(iter(documents))
        raw = get_page_content(documents, doc_id, f"{node['start_index']}-{node['end_index']}")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return ""
        if isinstance(parsed, dict):  # {"error": "..."} from the core retriever
            logger.error(f"get_page_content error for node {node.get('node_id')}: {parsed.get('error')}")
            return ""
        return "\n".join(p.get("content", "") for p in parsed).strip()

    def traverse(node_list):
        for node in node_list:
            if str(node.get("node_id")) in target_ids:
                content_text = node.get("text") or page_text(node)
                result_item = {
                    "title": node.get("title", ""),
                    "node_id": node.get("node_id"),
                    "relevant_contents": [],
                }
                if content_text:
                    result_item["relevant_contents"].append({
                        "page_index": node.get("start_index", 0),
                        "relevant_content": content_text,
                    })
                results.append(result_item)
            if "nodes" in node and isinstance(node["nodes"], list):
                traverse(node["nodes"])

    traverse(nodes)
    return results


def select_nodes(tree_structure: list, query: str, model: str, timeout: int) -> tuple[list, str | None]:
    """Ask the LLM which node ids answer the query. Returns (node_ids, thinking)."""
    prompt_structure = clean_structure_for_prompt(tree_structure)
    prompt = f"""You are given a query and the tree structure of a document.
You need to find all nodes that are likely to contain the answer.

Query: {query}

Document tree structure: {json.dumps(prompt_structure, indent=2)}

Reply in the following JSON format:
{{
  "thinking": "<your reasoning about which nodes are relevant>",
  "node_list": ["node_id1", "node_id2", ...]
}}
"""
    model = (model or "").removeprefix("litellm/")
    response = litellm.completion(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        timeout=timeout,
        # Configurable reasoning effort for the retrieval model (OpenRouter).
        extra_body={"reasoning": {"effort": "minimal"}},
    )
    response_text = response.choices[0].message.content or ""
    try:
        cleaned = response_text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        return parsed.get("node_list", []), parsed.get("thinking")
    except json.JSONDecodeError:
        logger.error(f"Failed to parse LLM retrieval response: {response_text}")
        return [], None


def retrieve_from_document(tree_structure: list, query: str, model: str, doc_info: dict, timeout: int) -> dict:
    """Full single-doc retrieval: select relevant nodes, then extract their content."""
    node_ids, thinking = select_nodes(tree_structure, query, model, timeout)
    retrieved_nodes = extract_node_content(tree_structure, node_ids, doc_info)
    return {"retrieved_nodes": retrieved_nodes, "thinking": thinking}
