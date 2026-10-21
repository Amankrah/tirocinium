"""Fixtures shared by the marketplace suites: a live app over a temporary data
directory with fake object storage, which is where seat-code exports land."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.storage import get_object_storage
from app.submissions.test_submissions import SECRET, FakeObjectStorage


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def tmp_data(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture()
def client(tmp_data: Path, storage: FakeObjectStorage) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_data, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    with TestClient(app) as c:
        yield c
