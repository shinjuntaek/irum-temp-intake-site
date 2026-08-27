# 메인 푸터·관리자 새로고침 QA

## 메인페이지 푸터

데스크톱 1280×800과 모바일 390×844에서 메인페이지 푸터를 확인했다. 기존 브랜드·서비스·사업자 정보와 함께 **개인정보 처리방침**, **이용약관**, **전화 문의 010-8839-3764**가 같은 시각 체계로 표시되며, 텍스트 잘림과 가로 overflow가 없다. 개인정보 처리방침과 이용약관은 기존 전문 modal을 재사용하고, 전화 문의는 `tel:01088393764`로 연결된다.

`/apply/matching/`과 `/apply/social/`에서는 메인 전용 정책·문의 column의 `hidden` 상태를 확인했다. 동일 canonical HTML을 사용하는 legacy alias도 정적 계약으로 동일하게 검증했다.

## 임시 관리자 새로고침

Chromium fixture에서 `admin-list`가 `TEMPORARY_INTAKE_UNAVAILABLE` 500을 두 번 반환한 뒤 세 번째에 정상 응답하는 시나리오를 검증했다. read-only action만 최대 3회 retry하며, 최초 batch가 복구된 뒤 다음 batch가 시작된다. 기존 화면이 있는 refresh가 최종 실패하면 기존 데이터를 유지하고 일시 지연 안내를 표시한다. `FORBIDDEN` 403은 한 번만 호출하고 재시도하지 않는다. QA 중 운영 DB write action 호출은 0건이다.
