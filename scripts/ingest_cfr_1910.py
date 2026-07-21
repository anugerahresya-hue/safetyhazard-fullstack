#!/usr/bin/env python3
"""
Ingest OSHA 29 CFR Part 1910 (General Industry) into the RAG service.

Pipeline (per confirmed design):

    eCFR API  →  parse per §section  →  render one PDF per section
              →  upload PDF to Supabase 'ehss-docs' bucket (public)
              →  POST {doc_id, file_url, title, category} to RAG /rag/index

Why this shape:
  * RAG /rag/index does NOT accept pre-chunked text. Its contract is
    {doc_id, file_url, title, category} and it fetches + chunks + embeds the
    file itself, deriving the {section, category, excerpt} that show up as
    chat sources. So we only control the file contents, title, and category.
  * One document per CFR section (e.g. § 1910.132) gives clean section-level
    retrieval and makes 'title' map naturally to the section citation.

Safety:
  * Defaults to DRY-RUN: builds everything and prints what WOULD be sent,
    without uploading or calling the production index. Use --commit to run.
  * --limit N processes only the first N sections (good for a live smoke test).
  * --sections 1910.132,1910.147 targets specific sections.

Requirements: httpx, reportlab, supabase (all already in requirements.txt).

Env (read from backend/.env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
RAG_SERVICE_URL.

Examples:
  # Dry run everything (no network writes):
  python scripts/ingest_cfr_1910.py

  # Live smoke test: ingest just PPE general requirements + LOTO:
  python scripts/ingest_cfr_1910.py --commit --sections 1910.132,1910.147

  # Full ingest of Part 1910:
  python scripts/ingest_cfr_1910.py --commit
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import httpx

# ── Config ──────────────────────────────────────────────────────────────────

ECFR_BASE = "https://www.ecfr.gov/api/versioner/v1"
TITLE = "29"
PART = "1910"
BUCKET = "ehss-docs"
# Upload under a namespaced prefix so CFR docs are distinguishable from
# admin-uploaded EHSS PDFs in the same bucket.
STORAGE_PREFIX = "cfr-1910"
USER_AGENT = "SafetyVision-CFR-Ingest/1.0 (+https://safetyvision)"

# eCFR § sign sometimes arrives as a mojibake byte; normalise to a real "§".
SECTION_SIGN = "§"


def _force_utf8_stdout() -> None:
    """Windows consoles default to cp1252 and choke on § / → in output."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass


def _load_env() -> None:
    """Load backend/.env if python-dotenv is available; harmless otherwise."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(here, os.pardir, ".env")
    load_dotenv(env_path)


# ── eCFR fetching / parsing ──────────────────────────────────────────────────


@dataclass
class Section:
    number: str          # e.g. "1910.132"
    heading: str         # e.g. "General requirements."
    subpart: str         # e.g. "I"
    category: str        # e.g. "Personal Protective Equipment"
    paragraphs: list[str] = field(default_factory=list)

    @property
    def citation(self) -> str:
        return f"29 CFR {self.number}"

    @property
    def title(self) -> str:
        # Title carries the citation + heading so chat answers can cite it.
        return f"{SECTION_SIGN} {self.number} {self.heading}".strip()

    @property
    def doc_id(self) -> str:
        # Stable, deterministic id → re-running updates the same doc rather
        # than creating duplicates (assuming the RAG upserts on doc_id).
        # number already includes "1910." → "cfr-1910-132".
        return f"cfr-{self.number.replace('.', '-')}"

    @property
    def storage_path(self) -> str:
        return f"{STORAGE_PREFIX}/{self.doc_id}.pdf"


def _clean(text: str) -> str:
    """Normalise whitespace and the § sign from eCFR text."""
    text = text.replace("�", SECTION_SIGN)  # replacement char → §
    text = text.replace(" ", " ")           # nbsp → space
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _client() -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT},
        timeout=90.0,
        follow_redirects=True,
    )


def latest_date(client: httpx.Client) -> str:
    """Most recent issued date for Title 29 (eCFR requires a dated snapshot)."""
    r = client.get(f"{ECFR_BASE}/versions/title-{TITLE}.json")
    r.raise_for_status()
    dates = sorted({v["date"] for v in r.json().get("content_versions", [])})
    if not dates:
        raise RuntimeError("Could not determine a valid eCFR date for Title 29")
    return dates[-1]


def list_sections(client: httpx.Client) -> list[Section]:
    """Walk the Part 1910 structure tree → non-reserved Section nodes."""
    r = client.get(f"{ECFR_BASE}/structure/current/title-{TITLE}.json")
    r.raise_for_status()
    root = r.json()

    def find_part(node: dict) -> dict | None:
        if isinstance(node, dict):
            if node.get("type") == "part" and node.get("identifier") == PART:
                return node
            for child in node.get("children") or []:
                found = find_part(child)
                if found:
                    return found
        return None

    part = find_part(root)
    if not part:
        raise RuntimeError(f"Part {PART} not found in Title {TITLE} structure")

    sections: list[Section] = []
    for subpart in part.get("children") or []:
        if subpart.get("type") != "subpart":
            continue
        sp_id = subpart.get("identifier") or ""
        category = _clean(subpart.get("label_description") or subpart.get("label") or "")
        for node in subpart.get("children") or []:
            if node.get("type") != "section":
                continue
            if node.get("reserved"):
                continue
            number = node.get("identifier") or ""
            heading = _clean(node.get("label_description") or "")
            if not number:
                continue
            sections.append(
                Section(number=number, heading=heading, subpart=sp_id, category=category)
            )
    return sections


def fetch_section_text(client: httpx.Client, date: str, section: Section) -> None:
    """Populate section.paragraphs from the eCFR full-text XML endpoint."""
    url = (
        f"{ECFR_BASE}/full/{date}/title-{TITLE}.xml"
        f"?part={PART}&section={section.number}"
    )
    r = client.get(url)
    r.raise_for_status()
    xml = r.content.decode("utf-8", "ignore")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise RuntimeError(f"XML parse failed for {section.number}: {exc}") from exc

    div = root if root.tag.startswith("DIV8") else root.find(".//DIV8")
    if div is None:
        section.paragraphs = []
        return

    paras: list[str] = []
    for p in div.findall(".//P"):
        text = _clean("".join(p.itertext()))
        if text:
            paras.append(text)
    section.paragraphs = paras


# ── PDF rendering ─────────────────────────────────────────────────────────────


def render_pdf(section: Section) -> bytes:
    """Render a section to a simple, text-extractable PDF via reportlab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from xml.sax.saxutils import escape

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        title=section.title,
        author="U.S. OSHA / eCFR",
        subject=section.category,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
    )
    styles = getSampleStyleSheet()
    h_style = ParagraphStyle(
        "CFRHeading", parent=styles["Heading1"], fontSize=14, spaceAfter=6
    )
    meta_style = ParagraphStyle(
        "CFRMeta", parent=styles["Normal"], fontSize=9, textColor="#555555", spaceAfter=12
    )
    body_style = ParagraphStyle(
        "CFRBody", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=6
    )

    story = [
        Paragraph(escape(section.title), h_style),
        Paragraph(
            escape(f"{section.citation} — Subpart {section.subpart}: {section.category}"),
            meta_style,
        ),
        Spacer(1, 6),
    ]
    for para in section.paragraphs:
        story.append(Paragraph(escape(para), body_style))

    doc.build(story)
    return buf.getvalue()


# ── Supabase upload ───────────────────────────────────────────────────────────


def get_supabase():
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (check backend/.env)"
        )
    return create_client(url, key)


def upload_pdf(supabase, section: Section, pdf_bytes: bytes) -> str:
    """Upload (upsert) the section PDF; return its public URL."""
    supabase.storage.from_(BUCKET).upload(
        path=section.storage_path,
        file=pdf_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    base = os.getenv("SUPABASE_URL").rstrip("/")
    return f"{base}/storage/v1/object/public/{BUCKET}/{section.storage_path}"


# ── RAG index ─────────────────────────────────────────────────────────────────


def index_document(client: httpx.Client, rag_url: str, section: Section, file_url: str) -> dict:
    payload = {
        "doc_id": section.doc_id,
        "file_url": file_url,
        "title": section.title,
        "category": section.category,
    }
    r = client.post(f"{rag_url.rstrip('/')}/rag/index", json=payload)
    r.raise_for_status()
    return r.json()


# ── Orchestration ─────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Ingest 29 CFR Part 1910 into the RAG service.")
    ap.add_argument(
        "--commit",
        action="store_true",
        help="Actually upload PDFs and call /rag/index. Without this flag it is a dry run.",
    )
    ap.add_argument("--limit", type=int, default=0, help="Process only the first N sections.")
    ap.add_argument(
        "--sections",
        type=str,
        default="",
        help="Comma-separated section numbers to target, e.g. 1910.132,1910.147",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=0.5,
        help="Seconds to sleep between eCFR fetches (be polite to the API).",
    )
    ap.add_argument(
        "--dump-pdf-dir",
        type=str,
        default="",
        help="Also write rendered PDFs to this local dir (handy to inspect in a dry run).",
    )
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    _force_utf8_stdout()
    _load_env()

    rag_url = os.getenv("RAG_SERVICE_URL")
    if args.commit and not rag_url:
        print("ERROR: RAG_SERVICE_URL not set (check backend/.env)", file=sys.stderr)
        return 2

    mode = "COMMIT" if args.commit else "DRY-RUN"
    print(f"=== 29 CFR Part {PART} → RAG ingest [{mode}] ===")

    with _client() as client:
        date = latest_date(client)
        print(f"eCFR snapshot date: {date}")
        sections = list_sections(client)
        print(f"Discovered {len(sections)} non-reserved sections in Part {PART}")

        if args.sections:
            wanted = {s.strip() for s in args.sections.split(",") if s.strip()}
            sections = [s for s in sections if s.number in wanted]
            print(f"Filtered to {len(sections)} requested section(s): {sorted(wanted)}")
        if args.limit > 0:
            sections = sections[: args.limit]
            print(f"Limited to first {len(sections)} section(s)")

        if not sections:
            print("Nothing to do.")
            return 0

        supabase = get_supabase() if args.commit else None
        if args.dump_pdf_dir:
            os.makedirs(args.dump_pdf_dir, exist_ok=True)

        ok, failed, total_chunks = 0, 0, 0
        for i, section in enumerate(sections, 1):
            tag = f"[{i}/{len(sections)}] {SECTION_SIGN} {section.number}"
            try:
                fetch_section_text(client, date, section)
                if not section.paragraphs:
                    print(f"{tag}: SKIP (no text content)")
                    continue

                pdf_bytes = render_pdf(section)

                if args.dump_pdf_dir:
                    with open(os.path.join(args.dump_pdf_dir, f"{section.doc_id}.pdf"), "wb") as fh:
                        fh.write(pdf_bytes)

                if not args.commit:
                    print(
                        f"{tag}: would index doc_id={section.doc_id} "
                        f"| title={section.title!r} | category={section.category!r} "
                        f"| paras={len(section.paragraphs)} | pdf={len(pdf_bytes)}B"
                    )
                    ok += 1
                else:
                    file_url = upload_pdf(supabase, section, pdf_bytes)
                    result = index_document(client, rag_url, section, file_url)
                    chunks = result.get("chunks_indexed", 0)
                    total_chunks += chunks
                    print(
                        f"{tag}: indexed status={result.get('status')} "
                        f"chunks={chunks} url={file_url}"
                    )
                    ok += 1
            except httpx.HTTPStatusError as exc:
                failed += 1
                body = exc.response.text[:200] if exc.response is not None else ""
                print(f"{tag}: HTTP {exc.response.status_code if exc.response else '?'} — {body}")
            except Exception as exc:  # noqa: BLE001 - report and continue the batch
                failed += 1
                print(f"{tag}: ERROR — {exc}")

            time.sleep(args.sleep)

    print("\n=== Summary ===")
    print(f"processed OK : {ok}")
    print(f"failed       : {failed}")
    if args.commit:
        print(f"total chunks : {total_chunks}")
    else:
        print("(dry run — no PDFs uploaded, no /rag/index calls made)")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
