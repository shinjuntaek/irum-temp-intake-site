# IRUM 임시 관리자 운영 모델

이 문서는 `pasted_content_4.txt`를 현재 `irum.click` 임시 관리자와 Supabase에 적용하는 내부 구현 계약이다. **정식 Manus CRM과 기존 임시 신청·Snapshot·2차 payload·Storage 객체는 수정 대상이 아니다.** 새 기능은 기존 Applicant를 `subject_type + subject_id`로 참조하는 추가형 overlay와 append-only 이벤트로만 저장한다.

## 원본 보존 경계

| 원본 | 작업 중 허용 동작 | 금지 동작 |
| --- | --- | --- |
| `temporary_intake_submissions` | 읽기, 신규 공개 신청의 기존 create/complete 유지 | 운영 레코드 수정·정규화·삭제·중복 생성 |
| `legacy_consultation_snapshots` | 읽기, private 사진 signed URL 발급 | Snapshot·사진 참조 수정 |
| `legacy_operational_snapshots` | 읽기, 기존 데이터 조회 접힘 영역 표시 | payload 수정·삭제 |
| `temporary_secondary_profile_forms` | 기존 링크 발급·재발급·폐기·수동 발송·draft·submit 유지 | 기존 payload·token 일괄 변경 |
| `temporary_secondary_profile_documents` | private signed URL 발급, 기존 업로드 흐름 유지 | 경로 변경·삭제 |
| `temporary_consultation_entries` | 기존 append-only 메모 추가·조회 유지 | 기존 메모 수정·삭제 |
| `storage.objects` | 기존 private 객체 signed URL 발급 | 이름 변경·이동·삭제 |

## 추가형 운영 테이블

| 테이블 | 저장 목적 | 개인정보 복제 여부 |
| --- | --- | --- |
| `temporary_admin_subject_workflows` | Applicant 참조별 현재 명시적 처리 단계·담당자 | 없음 |
| `temporary_admin_workflow_events` | 처리 단계·담당자 변경 append-only 이력 | 없음 |
| `temporary_secondary_profile_reviews` | 제출 완료 form의 심사 결과·사유·이전 결과 | 없음 |
| `temporary_admin_schedule_events` | 상담 예정일·다음 연락 예정일 저장/수정/취소 이력 | 없음 |
| `temporary_admin_member_events` | 승인 Applicant의 회원 전환·운영 상태 이력 | 없음 |
| `temporary_admin_matching_cases` | 승인된 남성·여성 Applicant 참조로 만든 1:1 case | 없음 |
| `temporary_admin_matching_events` | 남성 검토/수락/거절·일정·만남 상태 이력 | 없음 |
| `temporary_admin_social_events` | 실제 Event ID와 Applicant 참조별 모임 상태 이력 | 없음 |
| `temporary_admin_audit_events` | 로그인·사진 열람 등 도메인 테이블에 속하지 않는 운영 이벤트 | 없음 |

모든 append-only 테이블은 `ON DELETE RESTRICT`, RLS 활성화, 관리자 Edge Function 경유를 사용한다. raw token, signed URL, Storage path, 신청 payload 원문은 새 운영 이벤트 detail에 저장하지 않는다.

## 처리 단계 판정

`신규 접수`, `2차 링크 발송 필요`, `2차 작성 대기`, `2차 작성 중`, `2차 심사 필요`는 기존 신청·form·sent·draft·submitted·review 데이터를 화면에서 파생한다. `1차 검토 중`, `승인`, `보류`, `미승인`, `회원 전환 완료`만 관리자가 명시적으로 저장하거나 심사/회원 이벤트로 결정한다.

파생 우선순위는 `회원 전환 완료` → 최신 심사 결정(승인/보류/미승인/추가 자료 요청) → `2차 심사 필요` → `2차 작성 중` → `2차 작성 대기` → `2차 링크 발송 필요` → 명시적 `1차 검토 중` → `신규 접수` 순서다.

## 화면 전용 동일인 그룹화

DB row는 합치지 않는다. 화면에서 다음 순서로만 그룹화한다.

1. 명시적으로 연결된 Applicant ID
2. 정규화된 전화번호
3. 안전하게 확인되는 외부 접수 ID

같은 그룹의 1:1·모임 신청은 `journeys` 배열로 각각 보존하고 `둘 다 신청`으로 표시한다. 명확한 키가 없는 유사 후보는 자동 병합하지 않고 `중복 가능성`만 표시한다.

## Edge action 분리

`temporary-intake-submit`은 기존 source version 16을 기준으로 공개 create/upload/complete, Snapshot exporter, admin list/photo/consultation action을 그대로 보존하고 `admin-operations-*` action을 추가한다. `temporary-secondary-profile`은 기존 build를 기준으로 공개 draft/submit·링크·서류 action을 보존하고 심사 저장/조회만 추가한다.

| Function | 신규 action | 역할 |
| --- | --- | --- |
| intake | `admin-operations-list` | workflow·schedule·member·matching·social·audit overlay 일괄 조회 |
| intake | `admin-session-start` | 로그인 운영 이력 1회 기록 |
| intake | `admin-workflow-set` | 명시적 처리 단계·담당자 저장 + event append |
| intake | `admin-schedule-add`, `admin-schedule-cancel` | 상담/다음 연락 일정 append-only 저장·수정·취소 |
| intake | `admin-member-set` | 최신 승인 심사 참조 확인 후 회원 상태 event append |
| intake | `admin-match-create`, `admin-match-transition` | 남성 선택형 1:1 case와 상태 이력 |
| intake | `admin-social-status-set` | 실제 Event ID 기반 모임 상태 event append |
| secondary | `secondary-admin-review` | 제출 완료 form만 승인·보류·미승인·자료 요청 저장 |
| secondary | 기존 `secondary-admin-list` 확장 | form별 review 이력 반환 |

## UI 계약

관리자 메뉴는 `대시보드`, `신청자`, `승인 회원`, `1:1 매칭`, `모임 신청 현황`, `할 일·일정`, `운영 이력`, `로그아웃`만 유지한다. 기존 Snapshot은 관련 화면의 `기존 데이터 조회` 접힘 영역에서만 읽기 전용으로 표시한다.

신청자 상세는 기존 확정된 다섯 영역 순서를 유지한다. 심사는 제출 완료 form에서만 가능하고, 보류·미승인·추가 자료 요청은 사유를 필수로 한다. 상담 예정일과 다음 연락 예정일은 별도 schedule event로 저장하며 기존 `next_action_due_at`은 `기존 출처`로만 표시한다.

수동 안내 문구는 브라우저 복사만 제공한다. 링크나 문구 복사는 `sent_at`을 변경하지 않는다. 실제 전달 후 기존 수동 발송 완료 action을 별도로 사용한다.

## 검증 계약

운영 write 테스트는 하지 않는다. migration은 transaction rollback 기반 fixture SQL로 제약을 확인하고, Edge mutation은 정적·bundle·fixture intercept QA로 성공/실패 계약을 검증한다. 배포 전후에 기존 테이블 ID·payload·token·Storage path checksum과 row count를 비교하며 새 overlay 테이블 증가만 허용한다.
