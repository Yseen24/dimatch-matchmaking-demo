"""Create a portable source snapshot using an explicit list of public source directories."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1])
destination.parent.mkdir(parents=True, exist_ok=True)
files = [root / name for name in ("README.md", "package.json", "vercel.json", ".gitignore")]
for folder in ("api", "backend", "docs", "scripts", "sources"):
    files.extend(p for p in sorted((root / folder).rglob("*"))
                 if p.is_file() and not p.is_symlink() and "__pycache__" not in p.parts)
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, "dimatch-matchmaking-demo/" + path.relative_to(root).as_posix())
