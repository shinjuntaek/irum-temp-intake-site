# 요청 테스트 DB 정리 및 2차 링크 재발급

## 제한 삭제

임시 Supabase의 `temporary_intake_submissions` 중 ID 42와 52가 정확히 `테스트` 이름인 것을 guard로 확인한 뒤 삭제했다. 두 신청에만 종속된 2차 form 2건, audit event 83건, private 사진 객체 4개를 함께 정리했다. 연결된 document와 상담 기록은 0건이었다. 삭제 후 신청·form·상담·Storage object 잔여가 모두 0건임을 확인했고, AP-38과 AP-39는 그대로 보존했다.

## 활성 링크 충돌 해소

AP-38은 `profile_female` `in_progress`, AP-39는 `profile_male` `pending` 활성 form을 각각 1건 보유하고 있었다. 신규 issue가 `ACTIVE_LINK_EXISTS`로 막히는 대신 기존 form ID·draft·document를 유지하면서 `token_hash`, `token_prefix`, `expires_at`만 교체하는 `secondary-admin-reissue` action을 추가했다.

운영 Edge build는 `secondary-link-reissue-20260826-3`이다. 공개 비관리자 호출은 HTTP 403 `FORBIDDEN`이며, raw token은 DB에 저장하지 않고 재발급 응답에서만 관리자 브라우저로 전달한다.

## 관리자 UI

활성 form이 선택되면 상단 `개인화 링크 발급` 버튼이 `기존 링크 재발급`으로 바뀐다. 클릭 시 기존 URL이 즉시 무효화된다는 확인창을 거쳐 새 URL을 발급하고, 새 URL과 `링크 복사` 버튼을 현재 관리자 탭의 sessionStorage에만 보관한다. 각 활성 form 카드에도 별도 `링크 재발급` 버튼을 유지한다.

Chromium fixture에서 재발급 API 1회, 대상 form ID, 14일 만료, 새 URL 표시, 복사 버튼 1개, 기존 draft revision 표시, private 사진·서류, 390px 가로 overflow 없음이 모두 통과했다. Fixture는 운영 DB를 읽거나 쓰지 않았다.
