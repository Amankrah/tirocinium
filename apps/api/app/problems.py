"""RFC 7807 problem details (backend guide section 7): every error the API
returns is application/problem+json with a title, status, and detail. Routes
raise plain HTTPException; the handler here renders the shape. A route that
needs RFC 7807 extension members (the frozen check's `blocked` list) passes a
dict detail: its "detail" key becomes the detail string and the rest merge
into the body as extensions, documented by a Problem subclass in the route's
response annotations."""

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException


class Problem(BaseModel):
    """The error body, also referenced from route response annotations so
    the contract documents error shapes."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None


def install_problem_details(app: FastAPI) -> None:
    async def handler(request: Request, exc: Exception) -> Response:
        assert isinstance(exc, StarletteHTTPException)
        detail: str | None = None
        extensions: dict[str, Any] = {}
        if isinstance(exc.detail, str):
            detail = exc.detail
        elif isinstance(exc.detail, dict):
            extensions = dict(exc.detail)
            maybe = extensions.pop("detail", None)
            detail = maybe if isinstance(maybe, str) else None
        body = Problem(
            title=HTTPStatus(exc.status_code).phrase,
            status=exc.status_code,
            detail=detail,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=body.model_dump(exclude_none=True) | extensions,
            headers=exc.headers,
            media_type="application/problem+json",
        )

    app.add_exception_handler(StarletteHTTPException, handler)
