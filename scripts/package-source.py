"""Archive the verified source export as the binary's source companion.

First create a frozen export with scripts/export-github.mjs. Reuse the checked
archive path instead of maintaining a second, less restrictive source allowlist.
No downloads, publication or bridge execution occur here.
"""
from pathlib import Path
import runpy
import sys

archive_script = Path(__file__).with_name("archive-github.py")
sys.argv = [str(archive_script), "--application-source", *sys.argv[1:]]
runpy.run_path(str(archive_script), run_name="__main__")
