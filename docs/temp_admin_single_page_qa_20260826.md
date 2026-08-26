# 임시 관리자 5영역 단일 상세 QA

검증 대상은 `https://irum.click/admin/`에 게시될 `admin.html`과 `admin/index.html`이며, fixture QA는 Supabase DB를 읽거나 쓰지 않고 로컬 정적 서버와 Chromium에서 수행했다.

## 정적 계약

`admin.html`과 `admin/index.html`의 byte identity를 확인했다. inline script 문법, 5개 section marker, sidebar `티어 확인 리드` 비노출 wrapper, `임시 접수` 표시 정규화, 실제 고객 작성 2차 payload 전용 표시, private 사진 signed URL 경로, private 서류 URL action, 2차 링크 복사/sessionStorage 보안 계약을 함께 검증했다.

## Chromium fixture 결과

| 검증 항목 | 결과 |
|---|---|
| 무인증 접근 | 로그인 버튼 표시, 관리자 layout 비노출 |
| 신청자 목록 | `티어 확인 리드` 0건, `임시 접수`/`temporary_intake` 0건, `신규 신청` 표시 |
| 상세 영역 | 5개, 순서 `1,2,3,4,5` |
| 영역 key | `primary-profile`, `secondary-responses`, `secondary-links`, `unified-notes`, `consultation-date` |
| legacy 탭·CURRENT WORK | 0건 |
| 중복 패널 | 2차 응답·2차 링크·통메모장·상담일자 각각 1개 |
| private 기능 | 사진 1개, 서류 버튼 1개, 링크 복사 버튼 1개 |
| 데스크톱 | 1425px viewport, 가로 overflow 없음 |
| 모바일 | 390px viewport, 가로 overflow 없음 |
| DB write | 0건 |

모바일에서는 sidebar가 접히고 상단 운영 header 아래로 사진, 신청자 요약, 5개 영역이 단일 세로 흐름으로 표시됐다. 입력·select·저장 버튼은 viewport 안에 유지됐다.
