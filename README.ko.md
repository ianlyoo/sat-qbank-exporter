# sat-qbank-exporter

Local-first SAT question bank exporter — generate PDFs via CLI with Vercel frontend and Render worker in offline-capable workflows.

[English](README.md)

[![CI](https://github.com/ianlyoo/sat-qbank-exporter/actions/workflows/ci.yml/badge.svg)](https://github.com/ianlyoo/sat-qbank-exporter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: v0.1.0](https://img.shields.io/github/v/release/ianlyoo/sat-qbank-exporter?label=v0.1.0)](https://github.com/ianlyoo/sat-qbank-exporter/releases/tag/v0.1.0)
[![Pages](https://img.shields.io/badge/Pages-GitHub_Pages-2ea44f)](https://ianlyoo.github.io/sat-qbank-exporter/)

College Board 문제은행에서 인쇄용 SAT 연습 세트를 뽑아내는 비공식 익스포터. assessment, 섹션, 도메인, 스킬, 난이도, 문항 수, 배치 규칙을 골라 깔끔한 PDF 연습 세트를 내 기기에서 렌더링합니다. 로컬 우선 — 계정도 호스팅도 없이 동작합니다.

- Node.js 20+, Playwright 기반 pdf-generation
- question-bank exporter, cli-tool, playwright 렌더
- Vercel 프론트 + Render 워커 선택 경로 (offline-capable)

## 빠른 시작 — nodejs와 cli-tool로 pdf-generation

로컬 우선 방식으로 nodejs 기반 cli-tool을 이용해 pdf-generation을 실행합니다.

### GitHub Release tarball로 설치

```bash
gh release download v0.1.0 --repo ianlyoo/sat-qbank-exporter --pattern "sat-qbank-exporter-*.tgz"
npm install ./sat-qbank-exporter-0.1.0.tgz
```

`gh`가 없을 때 — 로컬 tarball 빌드:

```bash
npm pack
npm install ./sat-qbank-exporter-0.1.0.tgz
```

## 사용 사례 — education과 question-bank

오프라인 인쇄 세트가 필요한 교육 환경에 적합합니다.

## 아키텍처: vercel과 render, playwright

vercel, render, playwright, exporter 흐름은 영문 README와 동일합니다.

## 벤치마크: 측정된 실행에서의 pdf-generation

> 검증된 증거만 제시합니다.

**설정 (인접한 제한사항):** 20문항 합성 작업, 모드당 1회 실행, 로컬 렌더만, 호스팅 경로 미사용.

Limitations restated: 합성 작업, 1회 실행, 로컬 측정만, 업스트림 변경 가능, 비공식 익스포터.

## 프로젝트 링크

- Repository: https://github.com/ianlyoo/sat-qbank-exporter
- Pages: https://ianlyoo.github.io/sat-qbank-exporter/

## 라이선스

MIT — [LICENSE](LICENSE)를 참조하세요.
