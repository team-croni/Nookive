#!/bin/bash
# scripts/run-sidecar.sh
# EmbeddingGemma 2 llama-server 로컬 가동 스크립트 (Metal GPU, 텍스트+이미지+오디오 멀티모달)

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_PATH="$PROJECT_DIR/bin/llama-server"
MODEL_PATH="$PROJECT_DIR/models/embeddinggemma-2-Q8_0.gguf"
MMPROJ_PATH="$PROJECT_DIR/models/mmproj-embeddinggemma-2-Q8_0.gguf"
CTX_SIZE="${NOOKIVE_CTX_SIZE:-2048}"
BATCH_SIZE="${NOOKIVE_BATCH_SIZE:-1024}"
UBATCH_SIZE="${NOOKIVE_UBATCH_SIZE:-1024}"
PARALLEL_SLOTS="${NOOKIVE_PARALLEL:-1}"
PORT="${NOOKIVE_PORT:-8080}"
LOCK_DIR="${TMPDIR:-/tmp}/nookive-sidecar.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
SERVER_PID=""
KEEP_LOCK=0

# sidecar를 여러 번 겹쳐 실행하면 Metal 초기화가 고착되거나 8080 포트를
# 서로 차지하려고 충돌할 수 있다. 프로세스가 살아 있는 동안에는 새 인스턴스를
# 시작하지 않는다.
find_existing_server() {
    ps -axo pid=,command= 2>/dev/null \
        | awk -v path="$BIN_PATH" -v self="$$" '$1 != self && index($0, path) > 0 { print $1; exit }'
}

stop_unhealthy_server() {
    local pid="$1"
    echo "⚠️ 응답하지 않는 기존 llama-server를 정리합니다 (PID: $pid)."
    kill -TERM "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        if ! kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
        sleep 0.2
    done
    kill -KILL "$pid" 2>/dev/null || true
    sleep 0.2
    if kill -0 "$pid" 2>/dev/null; then
        echo "❌ 기존 프로세스가 커널 대기 상태라 종료되지 않았습니다 (PID: $pid)."
        return 1
    fi
    return 0
}

acquire_lock() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        printf '%s\n' "$$" > "$LOCK_PID_FILE"
        return 0
    fi

    local old_pid=""
    if [ -r "$LOCK_PID_FILE" ]; then
        old_pid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
    fi

    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
        echo "❌ 이미 실행 중인 sidecar가 있습니다 (PID: $old_pid)."
        echo "   기존 프로세스를 먼저 정상 종료한 뒤 다시 실행하세요."
        return 1
    fi

    # 이전 실행이 비정상 종료되어 남은 잠금만 정리한다. 실제 프로세스가
    # 살아 있으면 위에서 반드시 중단한다.
    rm -f "$LOCK_PID_FILE" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || {
        echo "❌ sidecar 잠금을 확보하지 못했습니다: $LOCK_DIR"
        return 1
    }
    printf '%s\n' "$$" > "$LOCK_PID_FILE"
}

release_lock() {
    if [ "$KEEP_LOCK" -eq 1 ]; then
        echo "⚠️ sidecar 프로세스가 커널 대기 상태일 수 있어 잠금을 유지합니다: $LOCK_DIR"
        return
    fi
    rm -f "$LOCK_PID_FILE" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
}

cleanup() {
    trap - EXIT INT TERM
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill -TERM "$SERVER_PID" 2>/dev/null || true
        sleep 1
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            kill -KILL "$SERVER_PID" 2>/dev/null || true
        fi
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            KEEP_LOCK=1
            printf '%s\n' "$SERVER_PID" > "$LOCK_PID_FILE"
        fi
    fi
    release_lock
}

existing_server_pid="$(find_existing_server || true)"
if [ -n "$existing_server_pid" ]; then
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
        echo "✅ sidecar가 이미 실행 중입니다 (PID: $existing_server_pid, 포트: $PORT)."
        exit 0
    fi
    if ! stop_unhealthy_server "$existing_server_pid"; then
        echo "   상태 확인: ps -p $existing_server_pid -o pid,state,command="
        echo "   재시작 없이 해결되지 않으면 해당 PID가 UE 상태인지 확인하세요."
        exit 1
    fi
fi

acquire_lock || exit 1
trap cleanup EXIT INT TERM

# macOS 동적 라이브러리 경로 보장
export DYLD_LIBRARY_PATH="$PROJECT_DIR/bin:${DYLD_LIBRARY_PATH:-}"

# 1. 바이너리 존재 여부 검사
if [ ! -f "$BIN_PATH" ]; then
    if [ -f "$PROJECT_DIR/.cache/llama/build/bin/llama-server" ]; then
        mkdir -p "$PROJECT_DIR/bin"
        cp "$PROJECT_DIR/.cache/llama/build/bin/llama-server" "$BIN_PATH"
        cp "$PROJECT_DIR/.cache/llama/build/bin/libggml"* "$PROJECT_DIR/bin/" 2>/dev/null || true
    else
        echo "❌ llama-server 바이너리를 찾을 수 없습니다."
        exit 1
    fi
fi

# 2. 모델 파일 검사 (텍스트 본체 + 멀티모달 mmproj)
if [ ! -f "$MODEL_PATH" ] || [ ! -f "$MMPROJ_PATH" ]; then
    echo "⚠️ 모델 파일이 없습니다. 다운로드를 시작합니다..."
    bash "$PROJECT_DIR/scripts/download-model.sh"
fi

echo "=========================================================="
echo "🚀 EmbeddingGemma 2 llama-server 시작 (멀티모달)"
echo "• 포트: http://127.0.0.1:$PORT"
echo "• 텍스트 모델: $MODEL_PATH"
echo "• 멀티모달 mmproj(이미지/오디오): $MMPROJ_PATH"
echo "• 컨텍스트: $CTX_SIZE / batch: $BATCH_SIZE / ubatch: $UBATCH_SIZE / 슬롯: $PARALLEL_SLOTS"
echo "• 임베딩 전용 모드: ON"
echo "=========================================================="

# llama.cpp 버전에 따라 Metal 장치의 표시명이 MTL 또는 빈 값으로 다를 수
# 있으므로 장치명을 하드코딩하지 않는다. --gpu-layers all만 지정하면 llama.cpp가
# 사용 가능한 GPU backend를 자동 선택하고 mmproj도 같은 실행 설정을 사용한다.
if [ "${NOOKIVE_CPU_ONLY:-0}" = "1" ]; then
    echo "⚠️ NOOKIVE_CPU_ONLY=1: CPU/Accelerate 모드로 실행합니다."
    DEVICE_ARGS=(--device none --gpu-layers 0)
else
    echo "✅ GPU offload 요청: 사용 가능한 Metal backend를 자동 선택합니다."
    DEVICE_ARGS=(--gpu-layers all)
fi

COMMON_ARGS=(
    -m "$MODEL_PATH"
    --mmproj "$MMPROJ_PATH"
    -c "$CTX_SIZE"
    -ub "$UBATCH_SIZE"
    -b "$BATCH_SIZE"
    -np "$PARALLEL_SLOTS"
    --port "$PORT"
    --embedding
    --host 127.0.0.1
    --no-ui
)

start_server() {
    # GGML_BACKEND_PATH는 디렉터리가 아니라 단일 backend 파일을 받는다.
    # 디렉터리를 넘기면 llama.cpp가 /bin 자체를 dlopen하려고 하므로,
    # 실행 파일 옆의 libggml-*.so 자동 검색에 맡긴다.
    "$BIN_PATH" "${COMMON_ARGS[@]}" "$@" &
    SERVER_PID=$!
    for _ in $(seq 1 45); do
        if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
            wait "$SERVER_PID"
            return $?
        fi
        if ! kill -0 "$SERVER_PID" 2>/dev/null; then
            wait "$SERVER_PID" || true
            return 1
        fi
        sleep 1
    done
    echo "⚠️ sidecar가 45초 안에 준비되지 않았습니다."
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    kill -KILL "$SERVER_PID" 2>/dev/null || true
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        KEEP_LOCK=1
        printf '%s\n' "$SERVER_PID" > "$LOCK_PID_FILE"
        echo "⚠️ sidecar 프로세스가 아직 종료되지 않아 중복 실행 잠금을 유지합니다."
    fi
    # macOS Metal 초기화가 커널 대기 상태에 들어가면 wait 자체도 반환하지
    # 않을 수 있으므로, 여기서는 자식 종료를 기다리지 않는다.
    return 1
}

if start_server "${DEVICE_ARGS[@]}"; then
    exit 0
fi

if [ "${NOOKIVE_CPU_ONLY:-0}" != "1" ]; then
    if [ "${NOOKIVE_ALLOW_CPU_FALLBACK:-0}" = "1" ]; then
        echo "⚠️ Metal 초기화/기동 실패. NOOKIVE_ALLOW_CPU_FALLBACK=1이므로 CPU/Accelerate로 재시작합니다."
        start_server --device none --gpu-layers 0
    else
        echo "❌ Metal sidecar가 시작되지 않았습니다. CPU fallback은 기본적으로 비활성화되어 있습니다."
        echo "   GPU 재시도: 메모리 여유를 확보한 뒤 npm run sidecar"
        echo "   CPU 진단:   NOOKIVE_CPU_ONLY=1 npm run sidecar"
        exit 1
    fi
fi
