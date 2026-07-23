"""RFC 7807 problem details (backend guide section 7): every error the API
returns is application/problem+json with a title, status, and detail. Routes
raise plain HTTPException; the handler here renders the shape."""

from http import HTTPStatus

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
        detail = exc.detail if isinstance(exc.detail, str) else None
        body = Problem(
            title=HTTPStatus(exc.status_code).phrase,
            status=exc.status_code,
            detail=detail,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=body.model_dump(exclude_none=True),
            headers=exc.headers,
            media_type="application/problem+json",
        )

    app.add_exception_handler(StarletteHTTPException, handler)
