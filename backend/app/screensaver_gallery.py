"""Home-wide photo gallery stored on the hub, with household-only access."""

import base64
import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from pydantic import BaseModel, Field, ValidationError, field_validator
from starlette.concurrency import run_in_threadpool

PHOTO_PATH = "/api/home/screensaver/photos"
MAX_PHOTOS = 24
MAX_IMAGE_BYTES = 2_000_000
MAX_THUMBNAIL_BYTES = 150_000
MAX_REQUEST_BYTES = 2_870_000
PHOTO_ID = r"^[0-9a-f]{32}$"


class PhotoUpload(BaseModel):
    model_config = {"extra": "forbid", "strict": True}

    id: str = Field(pattern=PHOTO_ID)
    name: str = Field(min_length=1, max_length=160)
    data: str = Field(min_length=1)
    thumbnail: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def filename(cls, value):
        if not value.strip() or any(ord(character) < 32 for character in value):
            raise ValueError("invalid filename")
        return value


async def read_photo(request):
    # Bound the JSON before decoding it, even when the client streams the body.
    length = request.headers.get("content-length", "")
    if length.isdecimal() and int(length) > MAX_REQUEST_BYTES:
        raise HTTPException(413, "screensaver_photo_too_large")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
            raise HTTPException(413, "screensaver_photo_too_large")
        body.extend(chunk)
    try:
        photo = PhotoUpload.model_validate_json(body)
    except ValidationError:
        raise HTTPException(422, "invalid_screensaver_photo") from None
    return photo


def jpeg(value, limit):
    try:
        data = base64.b64decode(value, validate=True)
    except ValueError:
        raise HTTPException(422, "invalid_screensaver_photo") from None
    if len(data) > limit:
        raise HTTPException(413, "screensaver_photo_too_large")
    if not data.startswith(b"\xff\xd8\xff") or not data.endswith(b"\xff\xd9"):
        raise HTTPException(422, "invalid_screensaver_photo")
    return data


def gallery(db):
    photos = [dict(row) for row in db.execute("SELECT id,name FROM screensaver_photos ORDER BY sequence")]
    return {"photos": photos}


def clear_screensaver_gallery(db):
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='screensaver_photos'").fetchone():
        db.execute("PRAGMA secure_delete=ON")
        db.execute("DELETE FROM screensaver_photos")


def screensaver_gallery_router(store, user, admin, resetting):
    with store.connect() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS screensaver_photos (
                sequence INTEGER PRIMARY KEY,
                id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                image BLOB NOT NULL,
                thumbnail BLOB NOT NULL
            )
            """)

    def household_member(current=Depends(user)):
        if current.get("support"):
            raise HTTPException(403, "outside_support_scope")

    def require_available():
        if resetting():
            raise HTTPException(423, "reset_in_progress")

    router = APIRouter(prefix=PHOTO_PATH, dependencies=[Depends(household_member)])

    @router.get("")
    def list_photos():
        require_available()
        with store.connect() as db:
            return gallery(db)

    def persist_photo(photo):
        image = jpeg(photo.data, MAX_IMAGE_BYTES)
        thumbnail = jpeg(photo.thumbnail, MAX_THUMBNAIL_BYTES)
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            require_available()
            existing = db.execute(
                "SELECT name,image,thumbnail FROM screensaver_photos WHERE id=?", (photo.id,)
            ).fetchone()
            if existing:
                if tuple(existing) != (photo.name, image, thumbnail):
                    raise HTTPException(409, "screensaver_photo_conflict")
            else:
                if db.execute("SELECT COUNT(*) FROM screensaver_photos").fetchone()[0] >= MAX_PHOTOS:
                    raise HTTPException(409, "screensaver_gallery_full")
                db.execute(
                    "INSERT INTO screensaver_photos(id,name,image,thumbnail) VALUES(?,?,?,?)",
                    (photo.id, photo.name, image, thumbnail),
                )
            return gallery(db)

    @router.post("", dependencies=[Depends(admin)])
    async def save_photo(request: Request):
        photo = await read_photo(request)
        return await run_in_threadpool(persist_photo, photo)

    @router.get("/{id}")
    def photo_content(id: Annotated[str, Path(pattern=PHOTO_ID)], request: Request, thumbnail: bool = False):
        require_available()
        with store.connect() as db:
            column = "thumbnail" if thumbnail else "image"
            row = db.execute(f"SELECT {column} FROM screensaver_photos WHERE id=?", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "screensaver_photo_not_found")
        data = row[0]
        etag = '"' + hashlib.sha256(data).hexdigest() + '"'
        headers = {"ETag": etag, "Cache-Control": "private, no-cache", "Vary": "Cookie"}
        if any(
            match.strip().removeprefix("W/") in (etag, "*")
            for line in request.headers.getlist("if-none-match")
            for match in line.split(",")
        ):
            return Response(status_code=304, headers=headers)
        return Response(data, media_type="image/jpeg", headers=headers)

    @router.delete("/{id}", dependencies=[Depends(admin)])
    def delete_photo(id: Annotated[str, Path(pattern=PHOTO_ID)]):
        with store.connect() as db:
            db.execute("PRAGMA secure_delete=ON")
            db.execute("BEGIN IMMEDIATE")
            require_available()
            db.execute("DELETE FROM screensaver_photos WHERE id=?", (id,))
            return gallery(db)

    return router
