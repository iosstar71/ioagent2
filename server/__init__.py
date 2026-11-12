# -*- coding: utf-8 -*-
"""Project Mgmt (협업) — 전사 시스템 하위 서비스용 프로젝트 관리 서버 (Python 표준 라이브러리만 사용)

  - 작업자 확인(작업자 ID + 암호) 후 세션 토큰, 모든 자료 API 는 토큰 필수
  - 권한: 관리자 / PM / 리더 · 작업자(담당 서브시스템) — 브라우저 규칙을 서버에서 다시 검증
  - 동시 작업: 자료를 부분(서브시스템 · 행) 단위 리비전으로 관리 + 서브시스템 체크아웃 · 체크인(locks.py)
  - 저장소: SQLite 하나(data/pprjmgmt.db), 오류만 logs/error.log (크기 제한)
  - 하위 주소(conf/app.ini base_path, 예: /pprjmgmt) 아래에서 동작
"""
