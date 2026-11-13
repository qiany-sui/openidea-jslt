"""从锁定依赖构建两种发行产物。依赖安装独立执行，构建不会修改全局安装。"""
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
subprocess.run(["cargo", "build", "--locked", "--release", "--target", "wasm32-wasip2"], cwd=root, check=True)
(root / "dist").mkdir(exist_ok=True)
shutil.copyfile(root / "target/wasm32-wasip2/release/openidea_jslt.wasm", root / "dist/plugin.wasm")
subprocess.run([shutil.which("npm"), "--prefix", "server", "run", "build"], cwd=root, check=True)
subprocess.run([sys.executable, "scripts/package.py"], cwd=root, check=True)
