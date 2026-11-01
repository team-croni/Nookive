// scripts/eval/metadata.mjs
// 파일 내용 없이 이름/경로로만 검색되는 폴더·앱 레코드. 실제 앱의
// list_indexed_folders / list_applications 결과와 같은 형식으로 만든다.
// 회귀 평가 fixture와 공개 벤치마크(mixed)가 함께 쓴다.
import { applications, commonApplications, folders } from "./corpus.mjs";

export function folderRecords(pathPrefix) {
  return folders.map((name) => ({
    id: `folder:${pathPrefix}/${name}`,
    file: {
      path: `${pathPrefix}/${name}`,
      name,
      extension: "folder",
      kind: "folder",
      sizeBytes: 0,
      modifiedAt: "폴더",
    },
    similarityScore: 0,
    bestChunk: { chunkIndex: 0, textSnippet: `macOS folder: ${name}` },
    category: "document",
  }));
}

/** 평가 대상 앱과, 실제 Mac 규모를 맞추기 위한 흔한 앱 목록을 함께 만든다. */
export function applicationRecords() {
  const entries = [
    ...applications,
    ...commonApplications.map((name) => ({ name })),
  ];
  return entries.map(({ name: plistName, localizedName, bundleFile, bundleId }) => {
    // applications.rs의 application_names와 같은 규칙: 현지화 이름을 표시하고 Info.plist 이름은 검색용으로 남긴다.
    const name = localizedName ?? plistName;
    return {
      id: `application:/Applications/${bundleFile ?? plistName}.app`,
      file: {
        path: `/Applications/${bundleFile ?? plistName}.app`,
        name,
        extension: "app",
        kind: "application",
        ...(bundleId ? { bundleId } : {}),
        ...(localizedName ? { alternateNames: [plistName] } : {}),
        sizeBytes: 0,
        modifiedAt: "설치된 앱",
      },
      similarityScore: 0,
      bestChunk: {
        chunkIndex: 0,
        textSnippet: bundleId
          ? `macOS application: ${name}; bundle id: ${bundleId}`
          : `macOS application: ${name}`,
      },
      category: "application",
    };
  });
}
