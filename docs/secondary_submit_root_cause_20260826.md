# 임시 2차 신청 최종 제출 오류 진단

## 요구사항 기준

첨부 `/home/ubuntu/upload/pasted_content.txt`를 작업 요구사항 원본으로 사용한다. 기존 디자인, 신청자 데이터, 관리자 데이터, 기존 발급 링크를 변경하지 않고 `profile/index.html`, `temporary-secondary-profile` Edge Function, 격리 QA만 수정한다.

검증해야 하는 핵심은 `DRAFT_CONFLICT` 회복, submit 직전 현재 브라우저 payload 우선 병합, 배포 build ID 확인, `validateSubmission()` 조기 return 제거, QA action 이름 정정, 개인정보 동의와 formType별 필수값 false-positive 제거이다.

## 현재 코드에서 확인한 사실

| 영역 | 현재 동작 | 문제 |
|---|---|---|
| `profile/index.html::saveDraft()` | 예외를 내부에서 잡고 반환하지 않음 | submit이 draft 실패를 알 수 없음 |
| `profile/index.html::submit()` | `await saveDraft()` 뒤 무조건 `secondary-submit` | 자동저장 race·conflict 상태를 구분하지 못함 |
| `temporary-secondary-profile::secondary-submit` | `{...storedDraft, ...currentPayload}` 후 normalize | 병합 순서는 현재 payload 우선으로 올바름 |
| `validateSubmission()` | 여성·남성은 privacyConsent만 검사하고 즉시 return | 아래의 여성·남성 상세 검증 분기가 unreachable |
| Edge local build | `secondary-submit-merge-20260826-1` | 운영 배포 build와 아직 대조하지 않음 |
| `secondary-draft-save` | revision CAS, 불일치 시 `DRAFT_CONFLICT` 409 | 클라이언트가 회복 없이 메시지만 표시 |

운영 Function에 공개 설정으로 `{"action":"secondary-build"}`를 호출한 결과는 HTTP 400, `UNKNOWN_ACTION`이었다. 따라서 운영 배포본에는 현재 로컬·GitHub 소스의 `secondary-build` 분기가 포함되어 있지 않다. 로컬 temp 소스와 GitHub 게시 clone의 Edge Function SHA-256은 동일하지만, 운영 Function만 이전 버전인 **명확한 배포 불일치**다.

반면 운영 `https://irum.click/profile/`, 로컬 temp source, GitHub 게시 clone의 HTML SHA-256은 모두 동일했다. 운영 정적 페이지는 실제 `secondary-draft-save` action을 사용하며 잘못된 `secondary-save-draft` 문자열은 포함하지 않는다. 즉 정적 고객 페이지는 최신이지만 **Edge Function만 뒤처진 상태**다.

## 다음 검증

운영 `secondary-build` 응답을 민감키 노출 없이 확인하고, QA 스크립트의 action mock을 실제 `secondary-draft-save`로 고친다. 여성·남성 완성 fixture에서 자동저장 conflict 후 최신 payload가 submit request와 `submitted_payload`에 보존되는지 먼저 격리 검증한다. 이후 운영 Function을 동일 소스로 재배포하고 테스트 전용 form만 실제 제출하여 DB `status=submitted`를 확인한다.

## 적용한 수정

클라이언트 build ID는 `secondary-submit-cas-current-payload-20260826-2`다. `saveDraft()`는 진행 중 요청을 직렬화하고 성공·실패 결과를 반환한다. `DRAFT_CONFLICT` 시 서버의 실제 `current_revision`으로 갱신해 현재 form snapshot을 한 번 재저장하며, submit은 draft 저장 성공을 확인한 뒤 strict boolean으로 만든 현재 `payload`를 전송한다.

Edge Function은 privacy-only 조기 return을 제거해 여성·남성·모임 상세 validation을 실제 실행한다. draft CAS 충돌 응답은 fresh DB revision을 반환하고, submit은 normalize된 stored draft 위에 alias-aware current payload patch를 덮은 뒤 재정규화한다. 성공·idempotent replay 응답에는 `status=submitted`와 build ID를 포함한다.

QA의 잘못된 `secondary-save-draft` mock을 실제 `secondary-draft-save`로 수정했다. 390×844 격리 QA에서 여성 정상 제출, 여성 근무형태 기타 직접입력 누락 차단, 남성 verified 서류 제출, 남성 서류 미제출 차단, privacy false 차단, in-flight 자동저장과 submit 중첩, 최초 `DRAFT_CONFLICT` 후 현재 입력 보존·제출, 서버 `missing_fields` 단계 이동을 통과했다. Edge 번들링도 완료했다.
