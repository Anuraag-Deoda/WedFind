import os
from pathlib import Path


class StorageService:
    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)

    def _ensure_dir(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)

    def save_original(self, event_id: str, filename: str, data: bytes) -> str:
        path = self.storage_dir / "originals" / event_id / filename
        self._ensure_dir(path)
        path.write_bytes(data)
        return str(path)

    def save_processed(self, event_id: str, filename: str, data: bytes) -> str:
        path = self.storage_dir / "processed" / event_id / filename
        self._ensure_dir(path)
        path.write_bytes(data)
        return str(path)

    def save_thumbnail(self, event_id: str, filename: str, data: bytes) -> str:
        path = self.storage_dir / "thumbnails" / event_id / filename
        self._ensure_dir(path)
        path.write_bytes(data)
        return str(path)

    def save_selfie(self, filename: str, data: bytes) -> str:
        path = self.storage_dir / "selfies" / filename
        self._ensure_dir(path)
        path.write_bytes(data)
        return str(path)

    def get_original_path(self, event_id: str, filename: str) -> str:
        return str(self.storage_dir / "originals" / event_id / filename)

    def get_processed_path(self, event_id: str, filename: str) -> str:
        return str(self.storage_dir / "processed" / event_id / filename)

    def get_thumbnail_path(self, event_id: str, filename: str) -> str:
        return str(self.storage_dir / "thumbnails" / event_id / filename)

    def delete_file(self, path: str):
        try:
            os.remove(path)
        except OSError:
            pass

    def delete_event_files(self, event_id: str):
        import shutil

        for subdir in ["originals", "processed", "thumbnails"]:
            event_dir = self.storage_dir / subdir / event_id
            if event_dir.exists():
                shutil.rmtree(event_dir)
