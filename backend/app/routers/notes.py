from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services import notes as notes_svc

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""
    tags: list[str] = []
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    pinned: bool | None = None


@router.get("")
def list_notes(q: str | None = Query(None), tag: str | None = Query(None)):
    return notes_svc.list_notes(q=q, tag=tag)


@router.get("/tags")
def list_tags():
    return {"tags": notes_svc.all_tags()}


@router.get("/{note_id}")
def get_note(note_id: str):
    n = notes_svc.get_note(note_id)
    if n is None:
        return {"error": "Note not found"}
    return n


@router.post("")
def create_note(body: NoteCreate):
    return notes_svc.create_note(body.title, body.content, body.tags, body.pinned)


@router.patch("/{note_id}")
def update_note(note_id: str, body: NoteUpdate):
    updates = body.model_dump(exclude_none=True)
    n = notes_svc.update_note(note_id, updates)
    if n is None:
        return {"error": "Note not found"}
    return n


@router.delete("/{note_id}")
def delete_note(note_id: str):
    if notes_svc.delete_note(note_id):
        return {"ok": True}
    return {"error": "Note not found"}
