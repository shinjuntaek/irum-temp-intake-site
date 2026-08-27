# pasted_content_5 비파괴 구현 모델

## 보존 원칙

기존 Applicant, 1·2차 payload, 사진·서류, Storage 객체, 개인화 링크·token hash, draft·제출 lifecycle, 상담 메모, Snapshot, 기존 운영 event는 수정·복제·삭제하지 않는다. 신규 운영 정보는 `subject_type + subject_id` 또는 기존 form/case ID만 참조한다. 모든 write QA는 브라우저 fixture에서 네트워크를 대체하며 운영 고객 row를 사용하지 않는다.

## 승인과 회원 전환

2차 최신 심사 `approved`는 회원 전환 자격만 의미한다. member event가 없는 승인 Applicant는 화면에서 `approval_pending`으로 보이지만 DB 회원 상태는 아직 없다. 첫 명시적 동작은 `converted`만 허용한다. 이후 서버 허용 전이는 `converted → matchable`, `matchable → matching`, `matching → meeting_scheduled`, `meeting_scheduled → matchable | paused | ended`, `paused → matchable | ended`이며 `ended`에서는 더 이상 전이할 수 없다.

신규 1:1 매칭 후보는 최신 2차 심사가 승인이고 최신 member event가 정확히 `matchable`인 Applicant만 포함한다. `admin-match-create`는 남성·여성 모두 성별, 최신 승인 심사, 최신 `matchable` 회원 상태를 재검증한다. 매칭 생성 시 두 회원의 append-only 상태를 `matching`으로 기록해 같은 회원이 새 후보에 계속 남지 않게 한다.

## 일정 projection

활성 일정은 원본 event를 변경하지 않고 `subject_type + subject_id + schedule_type`별로 `created_at`이 가장 최신인 event만 선택한다. 최신 action이 `created` 또는 `updated`이고 `scheduled_at`이 있을 때만 활성 목록에 표시한다. 최신 action이 `cancelled`면 이전 일정은 다시 나타나지 않는다. 상세 화면은 전체 이력을 계속 표시한다.

## 모임 결제 흐름

기존 `temporary_admin_social_events`의 check constraint와 row는 변경하지 않는다. 결제 상태를 포함하는 새 append-only `temporary_admin_social_participation_events_v2`를 추가하고 기존 Event Snapshot ID와 Applicant subject만 참조한다. 서버 전이는 `applied → reviewing | cancelled`, `reviewing → selected | waitlisted | cancelled`, `waitlisted → selected | cancelled`, `selected → payment_pending | cancelled`, `payment_pending → paid | cancelled`, `paid → confirmed | cancelled`, `confirmed → attended | no_show | cancelled`만 허용한다. `cancelled`와 `no_show`는 사유가 필수다.

외부 결제 연동과 결제 개인정보 저장은 만들지 않는다. 관리자가 입금 확인 후 `paid`를 수동 저장하며 event에는 상태·처리 관리자·시각·사유만 남긴다. 참가비는 Event Snapshot에 존재하는 알려진 fee key만 화면에서 읽고, 값이 없으면 `참가비 미등록`으로 표시한다.

## 필터와 링크 소유권

신청자 필터는 `q`, `stage`, `service`, `secondaryLink`, `secondaryCompletion`, `gender`, `owner`, `source`, `duplicate` query로 직렬화한다. 허용값 whitelist에 없는 값은 `all` 또는 빈 검색어로 정규화한다. 검색 결과와 표시 건수는 같은 `filteredItems()` 결과를 사용한다. 상세 화면을 닫을 때 query를 유지하고 대시보드 stage 이동도 같은 query writer를 사용한다.

2차 발송 mark/clear는 `form_id + subject_type + subject_id`를 필수로 받고 form row의 실제 소유권과 일치할 때만 처리한다. form 없음은 404, subject 불일치는 `FORM_SUBJECT_MISMATCH` 409를 반환한다. idempotent 요청도 소유권 검증 뒤 응답한다. profile event와 admin audit에는 이전 발송 상태·관리자·시각만 기록하고 raw token, signed URL, Storage path, payload는 기록하지 않는다.

## 관리자 답변 표시

`submitted` form은 `submitted_payload`, 작성 중 form은 `draft_payload`를 읽는다. 여성·남성·모임별 label map을 사용하고 1차 기본 프로필의 이름·연락처는 중복 표시하지 않는다. 개인정보 동의는 숨기지 않고 `동의 / 미동의`로 표시한다. boolean·배열·객체는 한글 운영 표현으로 변환하고 document type/status는 각각 `직업 인증서류`, `연소득 인증서류`, `순자산 인증서류`, `명함 인증서류` 및 `확인 완료 / 확인 실패 / 확인 중`으로 표시한다.
