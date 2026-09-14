import json
import sys

from openai import APIStatusError, OpenAI


def main() -> None:
    payload = json.load(sys.stdin)
    api_key = payload.get("api_key")
    base_url = payload.get("base_url")
    model = payload.get("model")
    messages = payload.get("messages")
    response_format = payload.get("response_format")
    temperature = payload.get("temperature")

    if (
        not api_key
        or not base_url
        or not model
        or not isinstance(messages, list)
        or not isinstance(response_format, dict)
        or (temperature is not None and not isinstance(temperature, (int, float)))
    ):
        raise ValueError("OpenAI 调用参数不完整。")

    client = OpenAI(api_key=api_key, base_url=base_url)
    request_kwargs = {
        "model": model,
        "messages": messages,
        "response_format": response_format,
        "stream": True,
    }
    if temperature is not None:
        request_kwargs["temperature"] = temperature

    stream = client.chat.completions.create(
        **request_kwargs,
    )

    content_parts: list[str] = []
    for chunk in stream:
        if not chunk.choices:
            continue
        content = chunk.choices[0].delta.content
        if not content:
            continue
        content_parts.append(content)
        # The parent process treats each progress marker as stream activity and
        # resets its idle timeout. The complete JSON is emitted after the marker.
        sys.stdout.write(".")
        sys.stdout.flush()

    content = "".join(content_parts)
    if not content:
        raise ValueError("OpenAI 返回内容为空。")

    sys.stdout.write("\n__OPENAI_STREAM_RESULT__")
    json.dump({"content": content}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    try:
        main()
    except APIStatusError as error:
        json.dump(
            {
                "error": f"OpenAI API 返回状态 {error.status_code}：{error.message}",
                "status": error.status_code,
            },
            sys.stderr,
            ensure_ascii=False,
        )
        raise SystemExit(2)
    except Exception as error:
        json.dump(
            {"error": f"{type(error).__name__}: {error}"},
            sys.stderr,
            ensure_ascii=False,
        )
        raise SystemExit(1)
