# 화면 API 연결 자리

이번 범위는 경로·파일 위치·공통 미구현 응답뿐이다. 요청 본문, 성공 응답 필드, DB 조회/저장, 인증과 실제 화면 연결은 기능 구현 시 정한다.

| 화면/용도 | 진입점 | 현재 상태 |
|---|---|---|
| 가입 | `POST /api/signup` | 501 미구현 |
| 관심사·프로필 | `GET /api/profile`, `PATCH /api/profile` | 501 미구현 |
| 미션 목록 | `GET /api/missions` | 501 미구현 |
| 미션 상세 | `GET /api/missions/[missionId]` | 501 미구현 |
| 실천 기록 | `POST /api/activity` | 501 미구현 |
| 대화 | 기존 `POST /api/chat` | 기존 FastAPI 연결 유지 |
| 장소 | 기존 `POST /api/places` | 기존 FastAPI 연결 유지 |

각 화면의 `frontend/src/features/{profile,missions,chat,map}/api.ts`에 경로를 모았다. 아직 fetch 함수나 payload 타입은 없다. 구현 시 여기에 화면용 호출을 추가하고, `src/app/api`의 진입점에서 `src/lib/server`의 Spring/AI 어댑터로 연결한다. 기존 UI는 이번에 바꾸지 않았다. 미션 경로의 식별자는 URL 자리 표시이며 DB의 ID 타입을 확정하지 않는다.

새 경로는 공통 `src/lib/server/not-implemented.ts`로 HTTP501과 `data: null`, `error.code: NOT_IMPLEMENTED`, `requestId`를 반환한다. 요청 본문을 읽거나 DB·모델·기존 서버에 전달하지 않는다. 빈 목록/저장 성공을 반환하지 않는다. 실제 기능을 붙일 때 해당 handler를 교체한다. 기존 health·AI 상태·챗·장소 경로의 응답은 이번 변경 대상이 아니다.

새 경로는 현재 미구현 표시용이며 API 계약이 확정된 것은 아니다. 필드·전송 형식·인증·DB 사용과 필요 시 경로 조정은 [모듈 설계](architecture.md)에 따라 기능별로 맞춘다.
