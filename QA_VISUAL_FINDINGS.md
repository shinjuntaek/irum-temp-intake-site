# 임시 관리자 시각 검수 기록

## 2026-08-27 Chromium fixture

- 데스크톱 신청자 목록에서 사진 trigger가 카드 전체 button 안에 다시 button으로 중첩되어 브라우저가 DOM을 자동 보정했고, 이 때문에 두 번째 카드가 사진·정보 영역으로 분리되고 다음 카드 폭이 비정상적으로 늘어났다.
- 사진 trigger를 `role="button"`인 비중첩 span으로 바꾸고 Enter·Space 키 동작을 추가한다. 카드 전체 열기 button과 비공개 사진 trigger는 서로 독립적으로 유지한다.
- 신청자 상세의 5개 영역 순서, 심사 이력, 개인화 링크, 메모, 분리 일정은 겹침 없이 렌더되었다.
- 상세 상단 비공개 사진은 헤더 높이보다 작게 렌더되어 빈 영역이 보였으므로 profile header 안에서 최소 250px 높이를 채우도록 보완한다.
- 텍스트 대비, desktop 가로 overflow, form control 가독성에는 이상이 없었다.

## 보완 후 재검수

데스크톱 카드 목록은 세 카드가 동일한 grid 열에 정렬되었고, 사진 trigger와 카드 상세 열기가 분리되었다. 390px 모임 화면의 자동 검사에서는 가로 overflow가 없었지만, drawer class가 제거된 직후 220ms 닫힘 transition 중에 screenshot이 캡처되어 왼쪽 overlay 일부가 남아 보였다. QA는 transition 완료 후 300ms 대기한 다음 최종 mobile 화면을 캡처하도록 조정한다.

닫힘 전환 대기 후 390px 모임 화면은 overlay 잔존 없이 정상 렌더되었고 Event·상태·메모 control이 viewport 안에 배치됐다. mobile menu open screenshot도 class 추가 직후 transition 중간 프레임을 잡고 있었으므로 열림 후 동일하게 300ms 대기해 완전히 열린 drawer를 검수한다.
