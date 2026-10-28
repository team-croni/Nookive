#!/usr/bin/env bash
# llama.cpp와 Metal backend를 같은 소스 버전으로 함께 빌드한다.
# macOS에서는 Metal을 동적 backend 플러그인으로 분리하면 dylib/.so 검색,
# ABI 및 @rpath 차이로 backend가 조용히 누락될 수 있으므로 정적으로 링크한다.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="${LLAMA_CPP_SOURCE:-$PROJECT_DIR/.cache/llama/llama.cpp}"
BUILD_DIR="${LLAMA_CPP_BUILD:-$PROJECT_DIR/.cache/llama-metal-build}"

if [ ! -f "$SOURCE_DIR/CMakeLists.txt" ]; then
  echo "❌ llama.cpp 소스가 없습니다: $SOURCE_DIR"
  echo "LLAMA_CPP_SOURCE=/path/to/llama.cpp bash scripts/build-llama-metal.sh"
  exit 1
fi

# A copied checkout can retain a CMake cache pointing at another project
# (this workspace previously used a different app name). Recreate only the
# generated build directory when that happens; never touch the source tree.
if [ -f "$BUILD_DIR/CMakeCache.txt" ] && ! grep -q "CMAKE_HOME_DIRECTORY:INTERNAL=$SOURCE_DIR$" "$BUILD_DIR/CMakeCache.txt"; then
  echo "⚠️  오래된 CMake 캐시를 제거합니다: $BUILD_DIR"
  rm -rf "$BUILD_DIR"
fi

cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=ON \
  -DGGML_METAL=ON \
  -DGGML_BACKEND_DL=OFF \
  -DGGML_NATIVE=OFF \
  -DGGML_CPU_ARM_ARCH=armv8.5-a \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_CURL=OFF \
  -DLLAMA_OPENSSL=OFF

cmake --build "$BUILD_DIR" --config Release --target llama-server -j"${CMAKE_BUILD_PARALLEL_LEVEL:-$(sysctl -n hw.ncpu 2>/dev/null || echo 4)}"

SERVER_PATH="$(find "$BUILD_DIR" -type f -name llama-server -perm -111 -print -quit)"
if [ -z "$SERVER_PATH" ]; then
  echo "❌ 빌드된 llama-server를 찾지 못했습니다: $BUILD_DIR"
  exit 1
fi

mkdir -p "$PROJECT_DIR/bin"
cp "$SERVER_PATH" "$PROJECT_DIR/bin/llama-server"
# CMake가 생성하는 macOS dylib symlink도 실제 파일을 따라가서 복사한다.
# llama-server는 .0.dylib 로더 이름을 사용하므로 symlink만 복사하면 이전
# 버전이 남을 수 있다.
rm -f "$PROJECT_DIR"/bin/libggml*.dylib \
  "$PROJECT_DIR"/bin/libllama*.dylib \
  "$PROJECT_DIR"/bin/libmtmd*.dylib
for library in \
  "$BUILD_DIR/bin/libggml.0.dylib" \
  "$BUILD_DIR/bin/libggml-base.0.dylib" \
  "$BUILD_DIR/bin/libggml-cpu.0.dylib" \
  "$BUILD_DIR/bin/libggml-blas.0.dylib" \
  "$BUILD_DIR/bin/libggml-metal.0.dylib" \
  "$BUILD_DIR/bin/libllama.0.dylib" \
  "$BUILD_DIR/bin/libllama-common.0.dylib" \
  "$BUILD_DIR/bin/libmtmd.0.dylib" \
  "$BUILD_DIR/bin/libllama-server-impl.dylib"; do
  [ -e "$library" ] || continue
  cp -L "$library" "$PROJECT_DIR/bin/"
done

# 정적 backend 빌드에서는 이전 동적 backend 모듈이 함께 있으면 중복 등록될 수
# 있으므로 실행 디렉터리에서 치운다. 복구 가능하도록 cache에 보관한다.
STALE_BACKEND_DIR="$PROJECT_DIR/.cache/llama-stale-backends"
mkdir -p "$STALE_BACKEND_DIR"
for backend in "$PROJECT_DIR"/bin/libggml-*.so; do
  [ -e "$backend" ] || continue
  mv "$backend" "$STALE_BACKEND_DIR/"
done

# 배포 번들에 동봉할 업스트림 라이선스와 소스 버전을 기록한다.
# scripts/generate-licenses.mjs가 이 파일들로 THIRD_PARTY_LICENSES.txt를 만든다.
LICENSE_DIR="$PROJECT_DIR/bin/licenses/upstream/llama.cpp"
rm -rf "$LICENSE_DIR"
mkdir -p "$LICENSE_DIR"
cp "$SOURCE_DIR/LICENSE" "$LICENSE_DIR/LICENSE"
if [ -f "$SOURCE_DIR/ggml/LICENSE" ]; then
  cp "$SOURCE_DIR/ggml/LICENSE" "$LICENSE_DIR/LICENSE-ggml"
fi
if [ -d "$SOURCE_DIR/licenses" ]; then
  cp -R "$SOURCE_DIR/licenses" "$LICENSE_DIR/licenses"
fi
git -C "$SOURCE_DIR" describe --tags --always --dirty > "$LICENSE_DIR/VERSION" 2>/dev/null \
  || echo "unknown" > "$LICENSE_DIR/VERSION"

# llama-server는 버전이 붙은 .0 dylib를 참조하므로, 같은 빌드의 파일을
# 프로젝트 실행 디렉터리의 로더 이름으로도 맞춰 둔다. 기존 버전과 섞이지 않게 한다.
echo "✅ Metal llama-server 설치 완료"
echo "검증: DYLD_LIBRARY_PATH=$PROJECT_DIR/bin $PROJECT_DIR/bin/llama-server --list-devices"
