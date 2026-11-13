"""生成未签名插件包、可离线安装的 npm 包及 SHA-256；不安装或发布任何内容。"""
from pathlib import Path
import gzip
import hashlib
import io
import json
import tarfile
import tomllib
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = tomllib.loads((root / "plugin.toml").read_text())
version = manifest["version"]
for name in ["package.json", "server/package.json"]:
    if json.loads((root / name).read_text())["version"] != version:
        raise SystemExit(f"版本不一致：{name}")
files = ["plugin.toml", manifest["wasm"], "LICENSE", "NOTICE", "README.md"]
files += [item["path"] for item in manifest["contributes"]["languages"]]
for name in [*files, "dist/server.cjs", "server/bin/openidea-jslt-lsp.cjs"]:
    if not (root / name).is_file():
        raise SystemExit(f"构建产物缺失：{name}；请先运行 npm run build")
if (root / manifest["wasm"]).read_bytes()[:8] != b"\0asm\x0d\0\x01\0":
    raise SystemExit("必须构建 wasm32-wasip2 Component，不能使用普通 core wasm")

plugin = root / "dist" / f'{manifest["id"]}-{version}.oiplugin'
with zipfile.ZipFile(plugin, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(files):
        info = zipfile.ZipInfo(name)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (root / name).read_bytes())

# npm 运行包只包含 bundle 和入口，不在用户机器上下载依赖或执行安装脚本。
package = {
    "name": "openidea-jslt-language-server", "version": version,
    "description": "Local JSLT language server for OpenIDEA",
    "license": "Apache-2.0", "engines": {"node": ">=20"},
    "bin": {"openidea-jslt-lsp": "bin/openidea-jslt-lsp.cjs"},
}
runtime_files = {
    "package.json": (json.dumps(package, indent=2) + "\n").encode(),
    "server.cjs": (root / "dist/server.cjs").read_bytes(),
    "bin/openidea-jslt-lsp.cjs": (root / "server/bin/openidea-jslt-lsp.cjs").read_bytes(),
    **{name: (root / name).read_bytes() for name in ["LICENSE", "NOTICE", "README.md"]},
}
runtime = root / "dist" / f'{package["name"]}-{version}.tgz'
with runtime.open("wb") as output:
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as archive:
            for name, data in sorted(runtime_files.items()):
                info = tarfile.TarInfo(f"package/{name}")
                info.size = len(data)
                info.mode = 0o755 if name.startswith("bin/") else 0o644
                archive.addfile(info, io.BytesIO(data))

outputs = [plugin, runtime]
(root / "dist/SHA256SUMS").write_text("".join(
    f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in outputs
))
for p in [plugin, runtime]:
    print(p)
