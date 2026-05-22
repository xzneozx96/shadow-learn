"""Shared single-document retrieval reasoning.

Used by both the async retrieval Celery task and the synchronous multi-document
search service so the node-selection logic lives in exactly one place.
"""

import json
import logging

import litellm
from pageindex.utils import get_text_of_pages
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


def extract_node_content(nodes: list, target_ids: list, pdf_path: str = None) -> list:
    """Recursively collect content for the nodes whose ids the LLM chose."""
    results = []

    def traverse(node_list):
        for node in node_list:
            if str(node.get("node_id")) in target_ids:
                result_item = {
                    "title": node.get("title", ""),
                    "node_id": node.get("node_id"),
                    "relevant_contents": [],
                }
                content_text = ""
                if "text" in node:
                    content_text = node["text"]
                elif pdf_path and "start_index" in node and "end_index" in node:
                    try:
                        content_text = get_text_of_pages(
                            pdf_path, node["start_index"], node["end_index"], tag=False
                        )
                    except Exception as ex:
                        logger.error(f"Failed to extract PDF text for node {node.get('node_id')}: {ex}")
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


def retrieve_from_document(tree_structure: list, query: str, model: str, pdf_path: str, timeout: int) -> dict:
    """Full single-doc retrieval: select relevant nodes, then extract their content."""
    node_ids, thinking = select_nodes(tree_structure, query, model, timeout)
    retrieved_nodes = extract_node_content(tree_structure, node_ids, pdf_path)
    return {"retrieved_nodes": retrieved_nodes, "thinking": thinking}
