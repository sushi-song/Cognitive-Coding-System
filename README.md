[README.md](https://github.com/user-attachments/files/32178907/README.md)
# Cognitive Coding System

A bilingual CSCL cognitive coding system for secondary-level cognitive coding experiments. The system implements **LLM-as-a-Judge Best-of-N Selection**: three independently generated candidates are evaluated by a separate judge model before the final coding result is assembled.

一个支持中英文切换的 CSCL 讨论帖认知编码系统。系统采用 **LLM-as-a-Judge Best-of-N Selection**：生成模型独立产生三组候选结果，再由独立筛选模型评分并汇总最终编码。

## Requirements / 环境要求

- Node.js 20 or later
- npm
- An OpenAI-compatible chat-completions API endpoint and key

## Run locally / 本地运行

### Python setup / Python 环境配置

The official OpenAI API uses the Python OpenAI SDK with strict JSON Schema. Other OpenAI-compatible providers continue to use the TypeScript HTTP adapter. Install Python 3.10 or later in addition to Node.js (22 LTS recommended). Python does not bypass network restrictions.

官方 OpenAI 接口使用 Python OpenAI SDK；除 Node.js（建议 22 LTS）外，请安装 Python 3.10 或更新版本。

Run these commands in the project folder before starting / 启动前在项目目录执行：

macOS / Linux:
```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
export OPENAI_PYTHON_BIN="$PWD/.venv/bin/python"
npm ci
npm run dev
```

Windows PowerShell:
```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:OPENAI_PYTHON_BIN = (Resolve-Path ".\.venv\Scripts\python.exe").Path
npm ci
npm run dev
```

To persist the interpreter selection, put its absolute path in a local `.env` file, for example `OPENAI_PYTHON_BIN=C:/your-project/.venv/Scripts/python.exe` on Windows. Do not commit your `.env` or `.venv`. Without this setting the server uses `python` on Windows and `python3` elsewhere.

要永久保存 Python 路径，将实际绝对路径写入本地 `.env` 的 `OPENAI_PYTHON_BIN`。未配置时，Windows 使用 `python`，其他系统使用 `python3`。不要上传 `.env` 或 `.venv`。

If Python reports `No module named 'openai'`, install requirements using the interpreter specified by `OPENAI_PYTHON_BIN`.

若出现 `No module named 'openai'`，请用 `OPENAI_PYTHON_BIN` 指定的同一个 Python 安装 requirements。


```bash
npm ci
npm run dev
```

Then open `http://127.0.0.1:3000/`. Model credentials entered in the interface are kept in the current browser-tab session and are not included in this repository.

然后访问 `http://127.0.0.1:3000/`。界面中填写的模型密钥仅保存在当前浏览器标签页会话中，不包含在本仓库中。

## Verification / 验证

```bash
npm test
```

This runs unit tests, the production build, and the integration test suite.

## Production build / 生产构建

```bash
npm run build
npm start
```

## Main files / 主要文件

- `server.ts`: API server, prompts, model calls, validation, and experiment persistence
- `secondary-experiment-core.ts`: M3 candidate mapping, judge validation, and export logic
- `src/App.tsx`: bilingual user interface
- `src/codebook.ts`: bilingual cognitive codebook and built-in test datasets
- `tests/`: unit and integration tests

Generated experiment records, local environment files, dependencies, build artifacts, caches, and backups are excluded from version control.
